"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, parseJson, prisma } from "@/lib/db";
import { CampaignFormSchema, FactFormSchema, PolicyFormSchema } from "@/lib/campaigns/schema";
import { seedDemo } from "@/lib/demo/seed";
import { applyDemoChange, detectChangedProducts, runMonitoringCycle, type DemoChange } from "@/lib/monitoring/monitor";
import { generateDrafts, createProspect, recordActivity, updateProspect } from "@/lib/sales/service";
import { csvRowToProspect, parseCsv, OUTREACH_STATUSES } from "@/lib/sales/scoring";
import { connectLiveStore, syncLiveStore } from "@/lib/shopify/sync";
import { getActiveStore, setSetting, SETTING_KEYS } from "@/lib/settings";
import { runVerification } from "@/lib/verification/service";
import type { CorrectedCopy } from "@/lib/ai/schemas";

// The local MVP runs single-user. Every action is attributed to this reviewer in the audit log.
const ACTOR = "demo@promisure.local";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params).toString()}`);

function formToCampaign(fd: FormData) {
  return CampaignFormSchema.safeParse({
    name: str(fd, "name"), channel: str(fd, "channel"), productId: str(fd, "productId"), variantId: str(fd, "variantId"), productUrl: str(fd, "productUrl"),
    headline: str(fd, "headline"), promoText: str(fd, "promoText"), advertisedPrice: str(fd, "advertisedPrice"), discountType: str(fd, "discountType") || "NONE",
    discountValue: str(fd, "discountValue"), startsAt: str(fd, "startsAt"), endsAt: str(fd, "endsAt"), claims: str(fd, "claims"), deliveryPromise: str(fd, "deliveryPromise"),
    status: fd.get("intent") === "submit" ? "SUBMITTED" : "DRAFT",
  });
}

async function validateVariantBelongs(productId: string | null, variantId: string | null) {
  if (!variantId) return true;
  const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
  return !!v && v.productId === productId;
}

// ---------------------------------------------------------------- Campaigns
export async function saveCampaign(fd: FormData) {
  const id = str(fd, "id");
  const parsed = formToCampaign(fd);
  const path = id ? `/campaigns/${id}/edit` : "/campaigns/new";
  if (!parsed.success) back(path, { error: parsed.error!.issues.map((i) => i.message).join(" · ") });
  const d = parsed.data!;
  if (!(await validateVariantBelongs(d.productId, d.variantId))) back(path, { error: "The selected variant does not belong to the selected product." });
  const store = await getActiveStore();
  if (!store) back(path, { error: "No store configured" });
  const data = {
    name: d.name, channel: d.channel, productId: d.productId, variantId: d.variantId, productUrl: d.productUrl, headline: d.headline, promoText: d.promoText,
    advertisedPrice: d.advertisedPrice, discountType: d.discountType, discountValue: d.discountValue, startsAt: d.startsAt, endsAt: d.endsAt,
    claimsJson: JSON.stringify(d.claims), deliveryPromise: d.deliveryPromise,
  };
  let campaignId = id;
  if (id) {
    const existing = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    // Editing an approved/live campaign sends it back through review.
    const status = d.status === "SUBMITTED" ? "SUBMITTED" : ["APPROVED", "LIVE"].includes(existing.status) ? "SUBMITTED" : existing.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
    await prisma.campaign.update({ where: { id }, data: { ...data, status } });
    await audit({ storeId: existing.storeId, actor: ACTOR, action: "CAMPAIGN_EDITED", entity: "Campaign", entityId: id, detail: { status, previousStatus: existing.status } });
  } else {
    const c = await prisma.campaign.create({ data: { ...data, storeId: store!.id, status: d.status, originalSnapshot: JSON.stringify({ ...data, submittedAt: new Date().toISOString() }), isDemo: store!.isDemo } });
    campaignId = c.id;
    await audit({ storeId: store!.id, actor: ACTOR, action: "CAMPAIGN_CREATED", entity: "Campaign", entityId: c.id, detail: { status: d.status } });
  }
  if (d.status === "SUBMITTED" || fd.get("intent") === "verify") await runVerification(campaignId, "SUBMISSION", ACTOR);
  revalidatePath("/campaigns");
  back(`/campaigns/${campaignId}`, { ok: d.status === "SUBMITTED" ? "Campaign submitted and verified." : "Draft saved." });
}

export async function verifyCampaignAction(fd: FormData) {
  const id = str(fd, "id");
  const r = await runVerification(id, "MANUAL", ACTOR);
  revalidatePath(`/campaigns/${id}`);
  back(`/campaigns/${id}`, { ok: `Verification complete: ${r.result.riskStatus} (risk score ${r.result.riskScore}).` });
}

export async function reviewCampaign(fd: FormData) {
  const id = str(fd, "id");
  const decision = str(fd, "decision") as "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  const note = str(fd, "note").trim();
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id }, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const latest = c.checks[0];
  if (!["APPROVED", "REJECTED", "CHANGES_REQUESTED"].includes(decision)) back(`/campaigns/${id}`, { error: "Invalid decision" });
  if (decision === "APPROVED") {
    if (!latest) back(`/campaigns/${id}`, { error: "Run verification before approving." });
    if (latest!.riskStatus === "BLOCK") back(`/campaigns/${id}`, { error: "A campaign with BLOCK findings cannot be approved. Resolve the findings and re-verify." });
    if (latest!.riskStatus === "REVIEW" && note.length < 10) back(`/campaigns/${id}`, { error: "Approving a REVIEW campaign needs a note (10+ characters) explaining how the open items were verified." });
  }
  await prisma.campaignApproval.create({ data: { campaignId: id, reviewer: ACTOR, decision, note, checkId: latest?.id ?? null, riskStatusAtDecision: latest?.riskStatus ?? null } });
  const status = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "DRAFT";
  await prisma.campaign.update({ where: { id }, data: { status } });
  await audit({ storeId: c.storeId, actor: ACTOR, action: `CAMPAIGN_${decision}`, entity: "Campaign", entityId: id, detail: { note, checkId: latest?.id, riskStatus: latest?.riskStatus } });
  revalidatePath(`/campaigns/${id}`);
  back(`/campaigns/${id}`, { ok: `Decision recorded: ${decision.replace("_", " ").toLowerCase()}.` });
}

export async function setCampaignStatus(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!["LIVE", "PAUSED"].includes(status)) back(`/campaigns/${id}`, { error: "Invalid status" });
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  if (status === "LIVE" && c.status !== "APPROVED" && c.status !== "PAUSED") back(`/campaigns/${id}`, { error: "Only approved campaigns can be marked live." });
  await prisma.campaign.update({ where: { id }, data: { status } });
  await audit({ storeId: c.storeId, actor: ACTOR, action: `CAMPAIGN_MARKED_${status}`, entity: "Campaign", entityId: id, detail: { note: "Status recorded in PromiSure AI only; no external ad platform was changed." } });
  back(`/campaigns/${id}`, { ok: `Marked as ${status.toLowerCase()} in PromiSure AI. No external platform was changed.` });
}

/** Copies the prepared corrected draft into the campaign record (PromiSure only — nothing is published). */
export async function applyCorrectedDraft(fd: FormData) {
  const id = str(fd, "id");
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id }, include: { variant: true } });
  const copy = parseJson<CorrectedCopy | null>(c.correctedDraftJson, null);
  if (!copy) back(`/campaigns/${id}`, { error: "No corrected draft available." });
  await prisma.campaign.update({
    where: { id },
    data: {
      headline: copy!.headline, promoText: copy!.marketingText, advertisedPrice: c.variant?.price ?? c.advertisedPrice, status: "DRAFT",
      claimsJson: JSON.stringify(parseJson<string[]>(c.claimsJson, []).filter((cl) => copy!.marketingText.toLowerCase().includes(cl.toLowerCase()) || copy!.headline.toLowerCase().includes(cl.toLowerCase()))),
      deliveryPromise: /delivery in \d/i.test(copy!.marketingText) ? "" : c.deliveryPromise,
    },
  });
  await audit({ storeId: c.storeId, actor: ACTOR, action: "CORRECTED_DRAFT_APPLIED", entity: "Campaign", entityId: id, detail: { generator: copy!.generator, before: { headline: c.headline, promoText: c.promoText } } });
  await runVerification(id, "MANUAL", ACTOR);
  back(`/campaigns/${id}`, { ok: "Corrected draft applied as a new draft and re-verified. Review it before submitting again." });
}

export async function deleteCampaign(fd: FormData) {
  const id = str(fd, "id");
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  await prisma.campaign.delete({ where: { id } });
  await audit({ storeId: c.storeId, actor: ACTOR, action: "CAMPAIGN_DELETED", entity: "Campaign", entityId: id, detail: { name: c.name } });
  back("/campaigns", { ok: `Deleted "${c.name}".` });
}

// ---------------------------------------------------------------- Products & facts
export async function addFact(fd: FormData) {
  const parsed = FactFormSchema.safeParse({ productId: str(fd, "productId"), category: str(fd, "category"), statement: str(fd, "statement") });
  const pid = str(fd, "productId");
  if (!parsed.success) back(`/products/${pid}`, { error: parsed.error!.issues.map((i) => i.message).join(" · ") });
  const f = await prisma.productFact.create({ data: { ...parsed.data!, source: "MERCHANT_ENTERED", verificationStatus: "MERCHANT_ENTERED", approved: fd.get("approved") === "on" } });
  await audit({ actor: ACTOR, action: "FACT_ADDED", entity: "ProductFact", entityId: f.id, detail: parsed.data });
  back(`/products/${pid}`, { ok: "Fact added. Monitoring will re-check linked campaigns on the next cycle." });
}

export async function toggleFactApproval(fd: FormData) {
  const id = str(fd, "id");
  const f = await prisma.productFact.findUniqueOrThrow({ where: { id } });
  if (f.source === "AI_SUGGESTION" && !f.approved) {
    // Approving an AI suggestion converts it into a merchant-entered fact; the merchant takes responsibility for it.
    await prisma.productFact.update({ where: { id }, data: { approved: true, source: "MERCHANT_ENTERED", verificationStatus: "MERCHANT_ENTERED" } });
  } else {
    await prisma.productFact.update({ where: { id }, data: { approved: !f.approved } });
  }
  await audit({ actor: ACTOR, action: f.approved ? "FACT_UNAPPROVED" : "FACT_APPROVED", entity: "ProductFact", entityId: id, detail: { statement: f.statement, source: f.source } });
  back(`/products/${f.productId}`, { ok: "Fact updated." });
}

export async function deleteFact(fd: FormData) {
  const id = str(fd, "id");
  const f = await prisma.productFact.findUniqueOrThrow({ where: { id } });
  if (f.source === "SHOPIFY_METAFIELD" && !f.isDemo) back(`/products/${f.productId}`, { error: "Shopify metafield facts are managed in Shopify and re-synced automatically." });
  await prisma.productFact.delete({ where: { id } });
  await audit({ actor: ACTOR, action: "FACT_DELETED", entity: "ProductFact", entityId: id, detail: { statement: f.statement } });
  back(`/products/${f.productId}`, { ok: "Fact removed." });
}

export async function simulateStoreChange(fd: FormData) {
  const variantId = str(fd, "variantId");
  const change = str(fd, "change") as DemoChange;
  const productId = str(fd, "productId");
  try {
    await applyDemoChange(variantId, change, ACTOR);
  } catch (e) {
    back(`/products/${productId}`, { error: (e as Error).message });
  }
  const summary = await runMonitoringCycle("SCHEDULED");
  back(`/products/${productId}`, { ok: `Demo store change applied. Monitoring re-checked ${summary.rechecked.length} campaign(s); ${summary.statusChanges} status change(s).` });
}

// ---------------------------------------------------------------- Shopify
export async function connectShopify() {
  const r = await connectLiveStore();
  if (!r.ok) back("/shopify", { error: r.error ?? "Connection failed" });
  await setSetting(SETTING_KEYS.activeStoreId, r.storeId!);
  const s = await syncLiveStore(r.storeId!);
  if (s.ok) await detectChangedProducts(r.storeId!);
  back("/shopify", s.ok ? { ok: `Connected to ${r.shop}. Synchronised ${s.products} products.` } : { error: `Connected, but sync failed: ${s.error}` });
}

export async function syncShopify() {
  const store = await getActiveStore();
  if (!store) back("/shopify", { error: "No store" });
  if (store!.isDemo) back("/shopify", { ok: "Demo store data is local. Use Settings → Reset demo data to restore it." });
  const s = await syncLiveStore(store!.id);
  back("/shopify", s.ok ? { ok: `Synchronised ${s.products} products (${s.changedProductIds.length} changed).` } : { error: s.error ?? "Sync failed" });
}

export async function switchStore(fd: FormData) {
  const id = str(fd, "storeId");
  await prisma.merchantStore.findUniqueOrThrow({ where: { id } });
  await setSetting(SETTING_KEYS.activeStoreId, id);
  revalidatePath("/", "layout");
  back("/shopify", { ok: "Active store changed." });
}

// ---------------------------------------------------------------- Settings
export async function saveSettings(fd: FormData) {
  const provider = str(fd, "aiProvider");
  if (!["rules", "ollama", "anthropic"].includes(provider)) back("/settings", { error: "Invalid provider" });
  await setSetting(SETTING_KEYS.aiProvider, provider);
  await setSetting(SETTING_KEYS.checkUrls, fd.get("checkUrls") === "on" ? "true" : "false");
  const store = await getActiveStore();
  const threshold = Number.parseInt(str(fd, "lowStockThreshold"), 10);
  if (store && Number.isFinite(threshold) && threshold >= 0 && threshold < 100000) await prisma.merchantStore.update({ where: { id: store.id }, data: { lowStockThreshold: threshold } });
  await audit({ storeId: store?.id, actor: ACTOR, action: "SETTINGS_UPDATED", entity: "AppSetting", detail: { provider, threshold } });
  back("/settings", { ok: "Settings saved." });
}

export async function savePolicy(fd: FormData) {
  const store = await getActiveStore();
  const parsed = PolicyFormSchema.safeParse({ type: str(fd, "type"), name: str(fd, "name"), minDays: str(fd, "minDays"), maxDays: str(fd, "maxDays"), regions: str(fd, "regions"), freeShippingThreshold: str(fd, "freeShippingThreshold"), maxDiscountPercent: str(fd, "maxDiscountPercent"), detail: str(fd, "detail") });
  if (!parsed.success) back("/settings", { error: parsed.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") });
  const { regions, ...rest } = parsed.data!;
  if (rest.minDays !== null && rest.maxDays !== null && rest.minDays > rest.maxDays) back("/settings", { error: "Minimum days must not exceed maximum days." });
  const p = await prisma.merchantPolicy.create({ data: { ...rest, regionsJson: JSON.stringify(regions), storeId: store!.id, isDemo: store!.isDemo } });
  await audit({ storeId: store!.id, actor: ACTOR, action: "POLICY_CREATED", entity: "MerchantPolicy", entityId: p.id, detail: parsed.data });
  back("/settings", { ok: "Policy added. Re-verify campaigns to apply it." });
}

export async function togglePolicy(fd: FormData) {
  const id = str(fd, "id");
  const p = await prisma.merchantPolicy.findUniqueOrThrow({ where: { id } });
  await prisma.merchantPolicy.update({ where: { id }, data: { active: !p.active } });
  await audit({ storeId: p.storeId, actor: ACTOR, action: p.active ? "POLICY_DEACTIVATED" : "POLICY_ACTIVATED", entity: "MerchantPolicy", entityId: id });
  back("/settings", { ok: "Policy updated." });
}

export async function deletePolicy(fd: FormData) {
  const id = str(fd, "id");
  const p = await prisma.merchantPolicy.delete({ where: { id } });
  await audit({ storeId: p.storeId, actor: ACTOR, action: "POLICY_DELETED", entity: "MerchantPolicy", entityId: id, detail: { name: p.name } });
  back("/settings", { ok: "Policy deleted." });
}

export async function runMonitoringNow() {
  const s = await runMonitoringCycle("SCHEDULED");
  back("/overview", { ok: `Monitoring cycle complete: ${s.changedProducts.length} product change(s), ${s.rechecked.length} campaign(s) re-checked, ${s.statusChanges} status change(s).` });
}

export async function resetDemo() {
  const { storeId, campaignIds } = await seedDemo(prisma);
  await detectChangedProducts(storeId);
  for (const id of campaignIds) await runVerification(id, "SUBMISSION", "seed");
  const live = await prisma.merchantStore.findFirst({ where: { isDemo: false } });
  if (!live) await setSetting(SETTING_KEYS.activeStoreId, storeId);
  await audit({ storeId, actor: ACTOR, action: "DEMO_RESET", entity: "MerchantStore", entityId: storeId });
  back("/settings", { ok: "Demo data restored." });
}

export async function markNotificationsRead() {
  await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  back("/overview", { ok: "Notifications marked as read." });
}

// ---------------------------------------------------------------- Prospects
function formToProspect(fd: FormData) {
  const emp = str(fd, "employeeCount");
  return {
    companyName: str(fd, "companyName"), contactName: str(fd, "contactName") || null, jobTitle: str(fd, "jobTitle") || null, website: str(fd, "website"), linkedinUrl: str(fd, "linkedinUrl"),
    email: str(fd, "email"), location: str(fd, "location") || null, country: str(fd, "country") || "Australia", industry: str(fd, "industry") || null, businessType: str(fd, "businessType") || null,
    shopifyEvidence: str(fd, "shopifyEvidence"), shopifyVerified: fd.get("shopifyVerified") === "on", employeeCount: emp ? Number.parseInt(emp, 10) : null,
    problemHypothesis: str(fd, "problemHypothesis"), notes: str(fd, "notes"),
  };
}

export async function saveProspect(fd: FormData) {
  const id = str(fd, "id");
  try {
    const p = id ? await updateProspect(id, formToProspect(fd), ACTOR) : await createProspect(formToProspect(fd), ACTOR);
    back(`/prospects/${p.id}`, { ok: id ? "Prospect updated." : "Prospect created." });
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect
    const msg = e && typeof e === "object" && "issues" in e ? (e as { issues: { path: string[]; message: string }[] }).issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") : (e as Error).message;
    back(id ? `/prospects/${id}` : "/prospects", { error: msg });
  }
}

export async function importProspectsCsv(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/prospects", { error: "Choose a CSV file." });
  if ((file as File).size > 2_000_000) back("/prospects", { error: "CSV must be under 2 MB." });
  const rows = parseCsv(await (file as File).text());
  let ok = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    const r = csvRowToProspect(row);
    if (!r.ok) {
      errors.push(`row ${i + 2}: ${r.error}`);
      continue;
    }
    await createProspect(r.data, ACTOR);
    ok++;
  }
  back("/prospects", errors.length ? { ok: `Imported ${ok} prospect(s).`, error: `${errors.length} row(s) skipped. ${errors.slice(0, 3).join(" | ")}` } : { ok: `Imported ${ok} prospect(s).` });
}

export async function generateDraftsAction(fd: FormData) {
  const id = str(fd, "id");
  await generateDrafts(id, ACTOR);
  back(str(fd, "returnTo") || `/prospects/${id}`, { ok: "Drafts generated. Copy and send them yourself; PromiSure AI never sends messages." });
}

export async function recordActivityAction(fd: FormData) {
  const id = str(fd, "id");
  const type = str(fd, "type");
  const allowed = ["NOTE", "CONNECTION_SENT", "MESSAGE_SENT", "EMAIL_SENT", "REPLY", "MEETING", "PILOT_OFFER", "CUSTOMER"];
  if (!allowed.includes(type)) back(`/prospects/${id}`, { error: "Invalid activity" });
  await recordActivity(id, type, str(fd, "detail").slice(0, 2000), ACTOR);
  back(`/prospects/${id}`, { ok: "Activity recorded." });
}

export async function setProspectStatus(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!(OUTREACH_STATUSES as readonly string[]).includes(status)) back(`/prospects/${id}`, { error: "Invalid status" });
  await prisma.prospect.update({ where: { id }, data: { outreachStatus: status } });
  await prisma.prospectActivity.create({ data: { prospectId: id, type: "STATUS_CHANGE", detail: `Status set to ${status}` } });
  await audit({ actor: ACTOR, action: "PROSPECT_STATUS", entity: "Prospect", entityId: id, detail: { status } });
  back(`/prospects/${id}`, { ok: "Status updated." });
}

export async function markDraft(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status") === "USED" ? "USED" : "DISCARDED";
  const d = await prisma.outreachDraft.update({ where: { id }, data: { status } });
  back(`/prospects/${d.prospectId}`, { ok: `Draft marked ${status.toLowerCase()}.` });
}

export async function deleteProspect(fd: FormData) {
  const id = str(fd, "id");
  const p = await prisma.prospect.delete({ where: { id } });
  await audit({ actor: ACTOR, action: "PROSPECT_DELETED", entity: "Prospect", entityId: id, detail: { company: p.companyName } });
  back("/prospects", { ok: `Deleted ${p.companyName}.` });
}
