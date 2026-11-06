import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DEMO_SHOP, seedDemo } from "@/lib/demo/seed";
import { applyDemoChange, detectChangedProducts, runMonitoringCycle } from "@/lib/monitoring/monitor";
import { processWebhook, verifyWebhookHmac } from "@/lib/shopify/webhooks";
import { runVerification } from "@/lib/verification/service";

let storeId: string;
let campaignIds: string[];

beforeAll(async () => {
  const s = await seedDemo(prisma);
  storeId = s.storeId;
  campaignIds = s.campaignIds;
  await detectChangedProducts(storeId);
  for (const id of campaignIds) await runVerification(id, "SUBMISSION", "test");
});
afterAll(() => prisma.$disconnect());

describe("16. Webhook authentication", () => {
  const secret = "shpss_test_secret";
  const body = JSON.stringify({ id: 1001, admin_graphql_api_id: "gid://shopify/Product/1001" });
  const sign = (b: string, s = secret) => crypto.createHmac("sha256", s).update(b).digest("base64");

  it("accepts a valid HMAC signature", () => {
    expect(verifyWebhookHmac(body, sign(body), secret)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets and missing headers", () => {
    expect(verifyWebhookHmac(body + " ", sign(body), secret)).toBe(false);
    expect(verifyWebhookHmac(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyWebhookHmac(body, null, secret)).toBe(false);
    expect(verifyWebhookHmac(body, sign(body), undefined)).toBe(false);
    expect(verifyWebhookHmac(body, "not-base64!!", secret)).toBe(false);
  });
  it("deduplicates repeated deliveries by webhook id", async () => {
    const args = { webhookId: "wh-123", topic: "products/update", shopDomain: DEMO_SHOP, payload: JSON.parse(body) };
    expect((await processWebhook(args)).status).toBe("processed");
    expect((await processWebhook(args)).status).toBe("duplicate");
    expect(await prisma.webhookEvent.count({ where: { webhookId: "wh-123" } })).toBe(1);
  });
});

describe("17. Scheduled campaign monitoring", () => {
  it("re-verifies affected campaigns after a store change and raises a notification", async () => {
    const campaign = await prisma.campaign.findFirstOrThrow({ where: { storeId, name: "Spring Rain Jacket – Instagram" } });
    expect(campaign.riskStatus).toBe("PASS");

    await applyDemoChange(campaign.variantId!, "SELL_OUT", "test");
    const summary = await runMonitoringCycle("SCHEDULED");

    expect(summary.changedProducts.map((p) => p.productId)).toContain(campaign.productId);
    const entry = summary.rechecked.find((r) => r.campaignId === campaign.id)!;
    expect(entry.previous).toBe("PASS");
    expect(entry.current).toBe("BLOCK");

    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(after.riskStatus).toBe("BLOCK");
    expect(JSON.parse(after.correctedDraftJson!).cta).toMatch(/notified/i);
    const note = await prisma.notification.findFirst({ where: { campaignId: campaign.id } });
    expect(note?.level).toBe("CRITICAL");
  });

  it("does not re-check draft campaigns, and is idempotent when nothing changed", async () => {
    const summary = await runMonitoringCycle("SCHEDULED");
    expect(summary.changedProducts).toHaveLength(0);
    expect(summary.rechecked).toHaveLength(0);
  });

  it("re-checks campaigns whose promotion expired since their last check", async () => {
    const c = await prisma.campaign.findFirstOrThrow({ where: { storeId, name: "Camp Chair – Pinterest" } });
    // Pin the last check before the expiry; otherwise a check made <1s earlier (seed or previous test) already covers it.
    await prisma.campaign.update({ where: { id: c.id }, data: { lastCheckedAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() - 1000) } });
    const summary = await runMonitoringCycle("SCHEDULED");
    const e = summary.rechecked.find((r) => r.campaignId === c.id)!;
    expect(e.reason).toBe("Promotion expired");
    expect(e.current).toBe("BLOCK");
  });

  it("refuses to simulate changes on non-demo stores", async () => {
    const live = await prisma.merchantStore.create({ data: { name: "Live", shopDomain: "live-test.myshopify.com", mode: "LIVE", isDemo: false } });
    const p = await prisma.product.create({ data: { storeId: live.id, shopifyId: "gid://shopify/Product/9", title: "X", handle: "x", status: "ACTIVE", variants: { create: { shopifyId: "gid://shopify/ProductVariant/9", title: "D", price: "1.00" } } }, include: { variants: true } });
    await expect(applyDemoChange(p.variants[0].id, "SELL_OUT")).rejects.toThrow(/never modifies live/);
    await prisma.merchantStore.delete({ where: { id: live.id } });
  });
});
