import { audit, prisma } from "@/lib/db";
import { productHash, syncLiveStore } from "@/lib/shopify/sync";
import { setSetting } from "@/lib/settings";
import { runVerification, type CheckTrigger } from "@/lib/verification/service";

/** Campaign statuses that are "registered" for monitoring. Drafts and rejected campaigns are not monitored. */
export const MONITORED_STATUSES = ["SUBMITTED", "APPROVED", "LIVE", "PAUSED"];

export async function computeMonitorHash(productId: string): Promise<string> {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: true, facts: true } });
  return productHash({
    status: p.status,
    title: p.title,
    handle: p.handle,
    onlineStoreUrl: p.publishedOnOnlineStore ? (p.onlineStoreUrl ?? "published") : null,
    variants: p.variants.map((v) => ({ id: v.shopifyId, price: v.price, compareAtPrice: v.compareAtPrice, inventoryQuantity: v.inventoryQuantity, availableForSale: v.availableForSale, inventoryPolicy: v.inventoryPolicy })),
    facts: p.facts.filter((f) => f.approved).map((f) => `${f.id}:${f.statement}:${f.verificationStatus}`).sort(),
  });
}

export interface MonitorSummary {
  startedAt: string;
  stores: { storeId: string; name: string; mode: string; synced: boolean; syncError?: string }[];
  changedProducts: { productId: string; title: string }[];
  rechecked: { campaignId: string; name: string; reason: string; previous: string | null; current: string }[];
  statusChanges: number;
}

/** Finds products whose monitored state changed since the last cycle. Updates the stored hash. */
export async function detectChangedProducts(storeId: string): Promise<string[]> {
  const products = await prisma.product.findMany({ where: { storeId }, select: { id: true, monitorHash: true } });
  const changed: string[] = [];
  for (const p of products) {
    const h = await computeMonitorHash(p.id);
    if (p.monitorHash !== h) {
      if (p.monitorHash !== null) changed.push(p.id); // first observation is a baseline, not a change
      await prisma.product.update({ where: { id: p.id }, data: { monitorHash: h } });
    }
  }
  return changed;
}

export async function recheckCampaignsForProducts(productIds: string[], trigger: CheckTrigger, reason: string, summary?: MonitorSummary) {
  if (!productIds.length) return;
  const campaigns = await prisma.campaign.findMany({ where: { productId: { in: productIds }, status: { in: MONITORED_STATUSES } } });
  for (const c of campaigns) {
    const r = await runVerification(c.id, trigger);
    summary?.rechecked.push({ campaignId: c.id, name: c.name, reason, previous: r.previous, current: r.result.riskStatus });
    if (summary && r.statusChanged) summary.statusChanges++;
  }
}

export async function runMonitoringCycle(trigger: CheckTrigger = "SCHEDULED", now = new Date()): Promise<MonitorSummary> {
  const summary: MonitorSummary = { startedAt: now.toISOString(), stores: [], changedProducts: [], rechecked: [], statusChanges: 0 };
  const stores = await prisma.merchantStore.findMany();
  for (const store of stores) {
    const entry: MonitorSummary["stores"][number] = { storeId: store.id, name: store.name, mode: store.mode, synced: false };
    if (store.mode === "LIVE") {
      const r = await syncLiveStore(store.id);
      entry.synced = r.ok;
      if (!r.ok) entry.syncError = r.error;
    }
    summary.stores.push(entry);

    const changed = await detectChangedProducts(store.id);
    for (const id of changed) {
      const p = await prisma.product.findUnique({ where: { id }, select: { title: true } });
      summary.changedProducts.push({ productId: id, title: p?.title ?? id });
    }
    await recheckCampaignsForProducts(changed, trigger, "Product data changed", summary);

    // Date-driven changes: offers that started/expired since their last check, and never-checked campaigns.
    const already = new Set(summary.rechecked.map((r) => r.campaignId));
    const dateDriven = await prisma.campaign.findMany({ where: { storeId: store.id, status: { in: MONITORED_STATUSES } } });
    for (const c of dateDriven) {
      if (already.has(c.id)) continue;
      const last = c.lastCheckedAt;
      const reason = !last
        ? "Never verified"
        : c.endsAt && c.endsAt <= now && c.endsAt > last
          ? "Promotion expired"
          : c.startsAt && c.startsAt <= now && c.startsAt > last
            ? "Promotion started"
            : null;
      if (!reason) continue;
      const r = await runVerification(c.id, trigger);
      summary.rechecked.push({ campaignId: c.id, name: c.name, reason, previous: r.previous, current: r.result.riskStatus });
      if (r.statusChanged) summary.statusChanges++;
    }
  }
  await setSetting("monitor.lastRun", JSON.stringify(summary));
  await audit({ action: "MONITORING_CYCLE", entity: "System", detail: { trigger, changed: summary.changedProducts.length, rechecked: summary.rechecked.length, statusChanges: summary.statusChanges } });
  return summary;
}

// ---------------------------------------------------------------------------
// Demo-only store change simulator: lets you watch monitoring react without a
// real Shopify store. Refuses to touch non-demo stores.
export type DemoChange = "PRICE_INCREASE" | "SELL_OUT" | "RESTOCK" | "ARCHIVE" | "ACTIVATE";

export async function applyDemoChange(variantId: string, change: DemoChange, actor = "demo-user") {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: { include: { store: true } } } });
  if (!v.product.store.isDemo) throw new Error("Store changes can only be simulated on the demo store. PromiSure AI never modifies live Shopify data.");
  switch (change) {
    case "PRICE_INCREASE": {
      const { toDecimal } = await import("@/lib/money");
      const next = toDecimal(v.price)!.times(1.1).toDecimalPlaces(0).minus("0.05").toFixed(2);
      await prisma.productVariant.update({ where: { id: v.id }, data: { price: next } });
      break;
    }
    case "SELL_OUT":
      await prisma.productVariant.update({ where: { id: v.id }, data: { inventoryQuantity: 0, availableForSale: v.inventoryPolicy === "CONTINUE" } });
      break;
    case "RESTOCK":
      await prisma.productVariant.update({ where: { id: v.id }, data: { inventoryQuantity: 40, availableForSale: true } });
      break;
    case "ARCHIVE":
      await prisma.product.update({ where: { id: v.productId }, data: { status: "ARCHIVED" } });
      break;
    case "ACTIVATE":
      await prisma.product.update({ where: { id: v.productId }, data: { status: "ACTIVE" } });
      break;
  }
  await audit({ storeId: v.product.storeId, actor, action: `DEMO_STORE_CHANGE_${change}`, entity: "ProductVariant", entityId: v.id, detail: { product: v.product.title, variant: v.title } });
}
