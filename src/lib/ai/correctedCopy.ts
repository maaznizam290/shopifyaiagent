import { extractPercentOff, extractPrices, formatMoney, moneyEquals, toDecimal, discountPercent } from "@/lib/money";
import { parseDeliveryPromise } from "@/lib/verification/checks";
import type { ClaimAnalysis, Finding, VerificationInput } from "@/lib/verification/types";
import { eligibleFacts } from "./claimRules";
import type { CorrectedCopy } from "./schemas";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matchCase = (original: string, replacement: string) =>
  // Capitalise only when the replaced text was capitalised; sentence starts are capitalised by tidy().
  /^[A-Z]/.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement.charAt(0).toLowerCase() + replacement.slice(1);

/** Collapses whitespace, removes dangling punctuation and capitalises the first letter. */
export function tidy(text: string): string {
  const t = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/(?:[,–-]\s*)+([.!?]|$)/g, "$1")
    .replace(/^[\s,.–-]+/, "")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function approvedDeliveryText(input: VerificationInput): string | null {
  const d = input.policies.filter((p) => p.active && p.type === "DELIVERY" && p.minDays !== null);
  if (!d.length) return null;
  // Quote the most conservative approved service rather than merging services.
  const slowest = [...d].sort((a, b) => (b.maxDays ?? b.minDays!) - (a.maxDays ?? a.minDays!))[0];
  return `delivery in ${slowest.minDays}–${slowest.maxDays ?? slowest.minDays} business days`;
}

/**
 * Deterministic corrected copy grounded only in live Shopify data, approved facts
 * and merchant policies. Used when no AI provider is configured, and as the
 * fallback whenever AI output fails the grounding guard.
 */
export function generateTemplateCopy(input: VerificationInput, findings: Finding[], analyses: ClaimAnalysis[]): CorrectedCopy {
  const notes: string[] = [];
  const live = input.variant ? toDecimal(input.variant.price) : null;
  const compareAt = input.variant ? toDecimal(input.variant.compareAtPrice) : null;
  const liveStr = live ? formatMoney(live, input.store.currency) : null;
  const codes = new Set(findings.filter((f) => f.outcome !== "PASS").map((f) => f.code));
  const expired = codes.has("PROMOTION_EXPIRED");
  const realDiscount = compareAt && live && compareAt.gt(live) ? discountPercent(compareAt, live).floor() : null;
  const approvedDelivery = approvedDeliveryText(input);

  const fix = (text: string): string => {
    let t = text;
    // Contradicted claims → grounded rewrite.
    for (const a of analyses) {
      if (a.classification === "CONTRADICTED" && a.suggestedRewrite) {
        t = t.replace(new RegExp(escapeRe(a.claim), "i"), (m) => matchCase(m, a.suggestedRewrite!));
      }
    }
    // Wrong prices → live price.
    if (liveStr) {
      for (const p of extractPrices(t)) {
        const ok = moneyEquals(p, live!) || (compareAt && moneyEquals(p, compareAt)) || input.policies.some((pol) => pol.freeShippingThreshold && moneyEquals(toDecimal(pol.freeShippingThreshold)!, p));
        if (!ok) t = t.replace(new RegExp(`(?:A\\$|AU\\$|\\$)\\s?${escapeRe(p.toFixed(p.decimalPlaces() ? 2 : 0))}(?:\\.00)?`), liveStr);
      }
    }
    // Discount percentages → actual Shopify discount, or removed.
    for (const pct of extractPercentOff(t)) {
      const re = new RegExp(`(?:up to\\s+)?${escapeRe(pct.toString())}\\s?%\\s?(off|discount|savings?)`, "i");
      if (realDiscount && realDiscount.gt(0) && !expired) {
        if (!pct.equals(realDiscount)) t = t.replace(re, `${realDiscount.toString()}% $1`);
      } else {
        t = t.replace(re, "").replace(/\s{2,}/g, " ");
      }
    }
    return t.trim();
  };

  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const unverifiable = analyses.filter((a) => a.classification === "UNVERIFIABLE").map((a) => a.claim.toLowerCase());
  const deliveryBad = ["DELIVERY_PROMISE_EXCEEDS_POLICY", "DELIVERY_PROMISE_PARTIAL", "FREE_SHIPPING_UNSUPPORTED", "REGION_NOT_SERVED", "FREE_SHIPPING_CONDITION_MISSING"].some((c) => codes.has(c));

  const keepSentence = (s: string): boolean => {
    const low = s.toLowerCase();
    if (unverifiable.some((u) => low.includes(u) || u.includes(low.replace(/[.!?]$/, "")))) {
      notes.push(`Removed unverifiable claim: "${s.trim()}"`);
      return false;
    }
    if (expired && /(ends|sale|offer|limited time|today only|% off|hurry|last chance|deal)/i.test(s)) {
      notes.push(`Removed expired offer language: "${s.trim()}"`);
      return false;
    }
    if (deliveryBad && (parseDeliveryPromise(s).maxDays !== null || parseDeliveryPromise(s).freeShipping || parseDeliveryPromise(s).regions.length)) {
      notes.push(`Removed unsupported delivery promise: "${s.trim()}"`);
      return false;
    }
    return true;
  };

  const title = input.product?.title ?? input.campaign.name;
  let headline = tidy(fix(input.campaign.headline));
  if (!keepSentence(headline) || !headline) headline = liveStr ? `${title}, now ${liveStr}` : title;

  const body = sentences(input.campaign.promoText).filter(keepSentence).map(fix);
  if (deliveryBad && approvedDelivery) body.push(`Enjoy ${approvedDelivery}.`);
  const marketingText = tidy(body.map(tidy).join(" ")) || `Discover the ${title}.`;

  const facts = eligibleFacts(input.facts);
  const productDescription = facts.length
    ? `${title}. ${facts.map((f) => f.statement.replace(/\.$/, "")).join(". ")}.`
    : `${title}. (Add approved product facts to generate a grounded description.)`;

  const outOfStock = codes.has("OUT_OF_STOCK") || codes.has("VARIANT_UNAVAILABLE") || codes.has("PRODUCT_ARCHIVED") || codes.has("PRODUCT_DRAFT");
  const cta = outOfStock ? "Get notified when it's back" : expired ? "Shop the range" : "Shop now";

  const explanationParts: string[] = [];
  if (findings.some((f) => f.type === "PRICE" && f.outcome === "BLOCK") && liveStr) explanationParts.push(`Prices were aligned to the live Shopify price (${liveStr}).`);
  const reasons = new Set<string>();
  for (const a of analyses.filter((x) => x.classification === "CONTRADICTED")) {
    if (reasons.has(a.reason)) continue;
    reasons.add(a.reason);
    explanationParts.push(`"${a.claim}" was corrected: ${a.reason}`);
  }
  if (expired) explanationParts.push("The offer has expired. Time-limited language was removed, and the campaign should be paused or re-scheduled.");
  if (outOfStock) explanationParts.push("The promoted variant cannot currently be purchased, so the CTA was changed to a waitlist prompt.");
  explanationParts.push(...notes);
  if (!explanationParts.length) explanationParts.push("No corrections were required; the copy is consistent with verified store facts.");

  return { headline, marketingText, productDescription, cta, explanation: explanationParts.join(" "), generator: "template", guardNotes: notes };
}

/**
 * Grounding guard for AI-generated copy. Rejects copy that introduces prices not
 * in the store, re-uses contradicted claims, or repeats unverifiable claims.
 */
export function guardCopy(copy: Omit<CorrectedCopy, "generator" | "guardNotes">, input: VerificationInput, analyses: ClaimAnalysis[]): string[] {
  const problems: string[] = [];
  const all = `${copy.headline}\n${copy.marketingText}\n${copy.productDescription}\n${copy.cta}`;
  const live = input.variant ? toDecimal(input.variant.price) : null;
  const compareAt = input.variant ? toDecimal(input.variant.compareAtPrice) : null;
  for (const p of extractPrices(all)) {
    const ok = (live && moneyEquals(p, live)) || (compareAt && moneyEquals(p, compareAt)) || input.policies.some((pol) => pol.freeShippingThreshold && moneyEquals(toDecimal(pol.freeShippingThreshold)!, p));
    if (!ok) problems.push(`Introduces unverified price ${formatMoney(p, input.store.currency)}`);
  }
  if (compareAt && live && compareAt.gt(live)) {
    const real = discountPercent(compareAt, live);
    for (const pct of extractPercentOff(all)) if (pct.minus(real).gte(0.5)) problems.push(`Overstates the discount (${pct}% vs ${real.toFixed(2)}%)`);
  } else if (extractPercentOff(all).length) problems.push("Introduces a discount that Shopify pricing does not support");
  for (const a of analyses) {
    if (a.classification !== "SUPPORTED" && all.toLowerCase().includes(a.claim.toLowerCase())) problems.push(`Repeats ${a.classification.toLowerCase()} claim "${a.claim}"`);
  }
  if (/\bwater[- ]?proof\b/i.test(all) && analyses.some((a) => a.classification === "CONTRADICTED" && /water[- ]?proof/i.test(a.claim))) problems.push('Re-uses contradicted term "waterproof"');
  return problems;
}
