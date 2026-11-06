import { audit, parseJson, prisma } from "@/lib/db";
import { analyzeClaimWithRules, extractImplicitClaims } from "@/lib/ai/claimRules";
import { generateTemplateCopy, guardCopy } from "@/lib/ai/correctedCopy";
import { mergeClaimAnalyses, resolveProvider } from "@/lib/ai/providers";
import type { CorrectedCopy } from "@/lib/ai/schemas";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { checkDestinationLive, checkDestinationSimulated } from "./destination";
import { verifyCampaign } from "./engine";
import type { ClaimAnalysis, DestinationResult, VerificationInput, VerificationResult } from "./types";

export type CheckTrigger = "MANUAL" | "SCHEDULED" | "WEBHOOK" | "SUBMISSION";

/** Demo storefront redirects used to exercise the redirect-destination check. */
export const DEMO_REDIRECTS: Record<string, string> = { "trailblazer-hiking-boots-2025": "summit-trail-runners" };

async function loadContext(campaignId: string) {
  return prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      store: { include: { policies: true } },
      product: { include: { variants: true, facts: true } },
      variant: true,
    },
  });
}

type Ctx = Awaited<ReturnType<typeof loadContext>>;

export function buildInput(ctx: Ctx, now: Date, destination: DestinationResult | null, claimAnalyses: ClaimAnalysis[]): VerificationInput {
  const toVariant = (v: NonNullable<Ctx["variant"]>) => ({
    id: v.id,
    title: v.title,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    inventoryTracked: v.inventoryTracked,
    inventoryQuantity: v.inventoryQuantity,
    inventoryPolicy: v.inventoryPolicy,
    availableForSale: v.availableForSale,
  });
  return {
    now,
    campaign: {
      name: ctx.name,
      channel: ctx.channel,
      productUrl: ctx.productUrl,
      headline: ctx.headline,
      promoText: ctx.promoText,
      advertisedPrice: ctx.advertisedPrice,
      discountType: ctx.discountType as VerificationInput["campaign"]["discountType"],
      discountValue: ctx.discountValue,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      claims: parseJson<string[]>(ctx.claimsJson, []),
      deliveryPromise: ctx.deliveryPromise,
      status: ctx.status,
    },
    product: ctx.product
      ? {
          id: ctx.product.id,
          title: ctx.product.title,
          handle: ctx.product.handle,
          status: ctx.product.status,
          publishedOnOnlineStore: ctx.product.publishedOnOnlineStore,
          onlineStoreUrl: ctx.product.onlineStoreUrl,
          tags: parseJson<string[]>(ctx.product.tagsJson, []),
          syncedAt: ctx.product.syncedAt,
        }
      : null,
    variant: ctx.variant ? toVariant(ctx.variant) : null,
    siblingVariants: ctx.product ? ctx.product.variants.map(toVariant) : [],
    facts: (ctx.product?.facts ?? []).map((f) => ({ id: f.id, category: f.category, statement: f.statement, source: f.source, verificationStatus: f.verificationStatus, approved: f.approved })),
    policies: ctx.store.policies.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      minDays: p.minDays,
      maxDays: p.maxDays,
      regions: parseJson<string[]>(p.regionsJson, []),
      freeShippingThreshold: p.freeShippingThreshold,
      maxDiscountPercent: p.maxDiscountPercent,
      detail: p.detail,
      active: p.active,
    })),
    store: { shopDomain: ctx.store.shopDomain, publicDomain: ctx.store.publicDomain, lowStockThreshold: ctx.store.lowStockThreshold, currency: ctx.store.currency },
    destination,
    claimAnalyses,
  };
}

export function collectClaims(explicit: string[], headline: string, promoText: string): string[] {
  const all = [...explicit.map((c) => c.trim()).filter(Boolean), ...extractImplicitClaims(`${headline}\n${promoText}`)];
  const seen = new Set<string>();
  return all.filter((c) => {
    const k = c.toLowerCase();
    if (seen.has(k) || [...seen].some((s) => s.includes(k))) return false;
    seen.add(k);
    return true;
  });
}

/** Implicit claims (extracted from copy, after the first `explicitCount`) that repeat an issue already reported are dropped. */
export function dedupeAnalyses(analyses: ClaimAnalysis[], explicitCount: number): ClaimAnalysis[] {
  const keys = new Set<string>();
  return analyses.filter((a, i) => {
    const key = `${a.classification}|${a.reason}|${[...a.contradictingFactIds, ...a.supportingFactIds].sort().join(",")}`;
    if (i >= explicitCount && keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export async function runVerification(campaignId: string, trigger: CheckTrigger, actor = "system", opts: { now?: Date } = {}): Promise<{ checkId: string; result: VerificationResult; copy: CorrectedCopy; statusChanged: boolean; previous: string | null }> {
  const ctx = await loadContext(campaignId);
  const now = opts.now ?? new Date(); // injectable clock for deterministic tests
  const providerSetting = await getSetting(SETTING_KEYS.aiProvider);
  const provider = resolveProvider(providerSetting);
  const checkUrls = (await getSetting(SETTING_KEYS.checkUrls)) !== "false";

  // Destination
  let destination: DestinationResult | null = null;
  const allowedHosts = [ctx.store.shopDomain, ctx.store.publicDomain].filter(Boolean) as string[];
  if (ctx.productUrl) {
    if (ctx.store.isDemo) {
      const catalogue = await prisma.product.findMany({ where: { storeId: ctx.storeId }, select: { handle: true, status: true, publishedOnOnlineStore: true } });
      destination = checkDestinationSimulated(ctx.productUrl, allowedHosts, catalogue.map((c) => ({ handle: c.handle, status: c.status, published: c.publishedOnOnlineStore })), DEMO_REDIRECTS);
    } else if (checkUrls) {
      destination = await checkDestinationLive(ctx.productUrl, allowedHosts);
    } else {
      destination = { status: "SKIPPED", requestedUrl: ctx.productUrl, finalUrl: null, httpStatus: null, redirectChain: [], resolvedHandle: null, simulated: false, message: "URL checks are disabled in Settings." };
    }
  }

  // Claims: deterministic rules first, AI layered on top when configured.
  const baseInput = buildInput(ctx, now, destination, []);
  const claims = collectClaims(baseInput.campaign.claims, ctx.headline, ctx.promoText);
  const ruleAnalyses = claims.map((c) => analyzeClaimWithRules(c, baseInput.facts));
  let analyses = ruleAnalyses;
  let aiLabel = "rules";
  if (provider.id !== "rules" && claims.length) {
    try {
      const ai = await provider.analyzeClaims({ claims, campaignText: `${ctx.headline}\n${ctx.promoText}`, productTitle: ctx.product?.title ?? ctx.name, facts: baseInput.facts, policies: baseInput.policies });
      analyses = mergeClaimAnalyses(ruleAnalyses, ai, baseInput.facts);
      aiLabel = provider.label;
    } catch (e) {
      aiLabel = `rules (fallback: ${provider.label} failed: ${(e as Error).message.slice(0, 120)})`;
    }
  }

  // Findings show each distinct issue once; copy correction still uses every analysis.
  const input = { ...baseInput, claimAnalyses: dedupeAnalyses(analyses, baseInput.campaign.claims.length) };
  const result = verifyCampaign(input);

  // Corrected copy
  let copy = generateTemplateCopy({ ...input, claimAnalyses: analyses }, result.findings, analyses);
  if (provider.id !== "rules" && result.riskStatus !== "PASS") {
    try {
      const ai = await provider.generateCopy({
        campaignText: { headline: ctx.headline, promoText: ctx.promoText },
        productTitle: ctx.product?.title ?? ctx.name,
        livePrice: ctx.variant?.price ?? null,
        compareAtPrice: ctx.variant?.compareAtPrice ?? null,
        facts: input.facts,
        policies: input.policies,
        findings: result.findings,
      });
      if (ai) {
        const problems = guardCopy(ai, input, analyses);
        if (problems.length === 0) copy = { ...ai, generator: provider.label, guardNotes: [] };
        else copy = { ...copy, guardNotes: [...copy.guardNotes, `AI copy rejected by grounding guard: ${problems.join("; ")}`] };
      }
    } catch (e) {
      copy = { ...copy, guardNotes: [...copy.guardNotes, `AI copy unavailable: ${(e as Error).message.slice(0, 120)}`] };
    }
  }

  const check = await prisma.campaignCheck.create({
    data: {
      campaignId,
      trigger,
      riskStatus: result.riskStatus,
      riskScore: result.riskScore,
      summary: result.summary,
      aiProvider: aiLabel,
      factsSnapshotJson: JSON.stringify({ variant: input.variant, product: input.product, destination, scoreBreakdown: result.scoreBreakdown, claims: analyses }),
      findings: { create: result.findings.map((f) => ({ type: f.type, code: f.code, severity: f.severity, outcome: f.outcome, originalClaim: f.originalClaim, verifiedInfo: f.verifiedInfo, sourceEvidence: f.sourceEvidence, recommendation: f.recommendation, createdAt: new Date(f.timestamp) })) },
    },
  });

  const previous = ctx.riskStatus;
  const statusChanged = previous !== null && previous !== result.riskStatus;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { riskStatus: result.riskStatus, riskScore: result.riskScore, lastCheckedAt: now, correctedDraftJson: JSON.stringify(copy) },
  });

  if (statusChanged || (trigger !== "MANUAL" && trigger !== "SUBMISSION" && result.riskStatus === "BLOCK" && previous !== "BLOCK")) {
    const worst = result.findings.find((f) => f.outcome === "BLOCK") ?? result.findings.find((f) => f.outcome === "REVIEW");
    await prisma.notification.create({
      data: {
        storeId: ctx.storeId,
        campaignId,
        level: result.riskStatus === "BLOCK" ? "CRITICAL" : result.riskStatus === "REVIEW" ? "WARNING" : "INFO",
        title: `${ctx.name}: ${previous ?? "NEW"} → ${result.riskStatus}`,
        body: worst ? `${worst.code.replace(/_/g, " ").toLowerCase()}: ${worst.verifiedInfo} A corrected draft has been prepared.` : result.summary,
      },
    });
  }

  await audit({ storeId: ctx.storeId, actor, action: "CAMPAIGN_VERIFIED", entity: "Campaign", entityId: campaignId, detail: { trigger, checkId: check.id, riskStatus: result.riskStatus, riskScore: result.riskScore, previous, ai: aiLabel } });
  return { checkId: check.id, result, copy, statusChanged, previous };
}
