/**
 * Deterministic verification through the real pipeline: real database records →
 * runVerification (the same code path the app uses) → persisted CampaignCheck and
 * VerificationFinding rows. No mocks, no AI (AI_PROVIDER=rules), no demo seed data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { runVerification } from "@/lib/verification/service";

const NOW = new Date("2026-11-05T09:00:00.000Z");
let storeId: string;
let seq = 0;

interface VariantSpec {
  price?: string;
  compareAtPrice?: string | null;
  inventoryQuantity?: number | null;
  inventoryTracked?: boolean;
  inventoryPolicy?: "DENY" | "CONTINUE";
  availableForSale?: boolean;
}
interface FactSpec {
  statement: string;
  source?: string;
  verificationStatus?: string;
  approved?: boolean;
}
interface CampaignSpec {
  headline?: string;
  promoText?: string;
  advertisedPrice?: string | null;
  discountType?: string;
  discountValue?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  claims?: string[];
  noVariant?: boolean;
}

/** Creates a product with a primary variant (+ an optional sibling) and a campaign that promotes it. */
async function setup(opts: { variant?: VariantSpec; sibling?: VariantSpec; facts?: FactSpec[]; campaign?: CampaignSpec } = {}) {
  const n = ++seq;
  const product = await prisma.product.create({
    data: {
      storeId, shopifyId: `gid://shopify/Product/pipe-${n}`, title: `Pipeline Jacket ${n}`, handle: `pipeline-jacket-${n}`, status: "ACTIVE",
      onlineStoreUrl: `https://pipeline.example/products/pipeline-jacket-${n}`, publishedOnOnlineStore: true,
      variants: {
        create: [
          { shopifyId: `gid://shopify/ProductVariant/pipe-${n}-a`, title: "M", sku: `PJ-${n}-M`, price: "189.00", compareAtPrice: "249.00", inventoryQuantity: 20, inventoryTracked: true, inventoryPolicy: "DENY", availableForSale: true, ...opts.variant },
          ...(opts.sibling ? [{ shopifyId: `gid://shopify/ProductVariant/pipe-${n}-b`, title: "XL", sku: `PJ-${n}-XL`, price: "199.00", ...opts.sibling }] : []),
        ],
      },
      facts: { create: (opts.facts ?? []).map((f) => ({ category: "OTHER", source: "MERCHANT_ENTERED", verificationStatus: "MERCHANT_ENTERED", approved: true, ...f })) },
    },
    include: { variants: { orderBy: { title: "asc" } }, facts: true },
  });
  const c = opts.campaign ?? {};
  const campaign = await prisma.campaign.create({
    data: {
      storeId, name: `Pipeline campaign ${n}`, channel: "INSTAGRAM", productId: product.id, variantId: c.noVariant ? null : product.variants[0].id,
      productUrl: product.onlineStoreUrl!, headline: c.headline ?? "Pipeline Jacket", promoText: c.promoText ?? "",
      advertisedPrice: c.advertisedPrice === undefined ? "189.00" : c.advertisedPrice, discountType: c.discountType ?? "NONE", discountValue: c.discountValue ?? null,
      startsAt: c.startsAt === undefined ? new Date(NOW.getTime() - 86_400_000) : c.startsAt, endsAt: c.endsAt === undefined ? new Date(NOW.getTime() + 7 * 86_400_000) : c.endsAt,
      claimsJson: JSON.stringify(c.claims ?? []), status: "DRAFT", // drafts are not picked up by monitoring in other suites
    },
  });
  return { product, campaign, variant: product.variants[0] };
}

/** Runs the real pipeline and reads the result back from the database. */
async function verify(campaignId: string, now = NOW) {
  const { checkId } = await runVerification(campaignId, "MANUAL", "pipeline-test", { now });
  const check = await prisma.campaignCheck.findUniqueOrThrow({ where: { id: checkId }, include: { findings: true, campaign: true } });
  const by = (code: string) => check.findings.filter((f) => f.code === code);
  const open = check.findings.filter((f) => f.outcome !== "PASS").map((f) => f.code);
  return { check, by, open };
}

beforeAll(async () => {
  const store = await prisma.merchantStore.create({
    data: { name: "Pipeline Test Store", shopDomain: "pipeline-test.myshopify.com", publicDomain: "pipeline.example", mode: "LIVE", isDemo: false, lowStockThreshold: 5 },
  });
  storeId = store.id;
  // Live landing-page checks hit the network; they are outside this suite's scope.
  await setSetting(SETTING_KEYS.checkUrls, "false");
});

afterAll(async () => {
  await prisma.merchantStore.delete({ where: { id: storeId } });
  await setSetting(SETTING_KEYS.checkUrls, "true");
  await prisma.$disconnect();
});

describe("pipeline basics", () => {
  it("persists the check, its findings and the campaign's status, using deterministic rules only", async () => {
    const { campaign } = await setup({ campaign: { advertisedPrice: "169.00" } });
    const { check } = await verify(campaign.id);
    expect(check.aiProvider).toBe("rules");
    expect(check.riskStatus).toBe("BLOCK");
    expect(check.campaign.riskStatus).toBe("BLOCK");
    expect(check.campaign.riskScore).toBe(check.riskScore);
    expect(check.findings.length).toBeGreaterThan(0);
    for (const f of check.findings) {
      expect(f.originalClaim).not.toBe("");
      expect(f.verifiedInfo).not.toBe("");
      expect(f.sourceEvidence).not.toBe("");
      expect(f.recommendation).not.toBe("");
    }
  });
});

describe("price mismatches (live variant data, exact decimal comparison)", () => {
  it("accepts equal amounts written differently ('189' vs '189.00')", async () => {
    const { campaign } = await setup({ campaign: { advertisedPrice: "189" } });
    const { by, open } = await verify(campaign.id);
    expect(by("PRICE_MATCH")).toHaveLength(1);
    expect(open.filter((c) => c.startsWith("PRICE") || c.startsWith("COPY_PRICE"))).toEqual([]);
  });

  it("blocks a one-cent difference and reports it with evidence", async () => {
    const { campaign } = await setup({ campaign: { advertisedPrice: "188.99" } });
    const { by, check } = await verify(campaign.id);
    const f = by("PRICE_MISMATCH")[0];
    expect(f.outcome).toBe("BLOCK");
    expect(f.severity).toBe("CRITICAL");
    expect(f.verifiedInfo).toContain("$189.00");
    expect(f.verifiedInfo).toContain("-$0.01");
    expect(f.sourceEvidence).toContain("SKU PJ-");
    expect(check.riskStatus).toBe("BLOCK");
  });

  it("does not round sub-cent differences away ('188.999')", async () => {
    const { campaign } = await setup({ campaign: { advertisedPrice: "188.999" } });
    expect((await verify(campaign.id)).by("PRICE_MISMATCH")).toHaveLength(1);
  });

  it("identifies an outdated price equal to the compare-at price", async () => {
    const { campaign } = await setup({ campaign: { advertisedPrice: "249.00" } });
    expect((await verify(campaign.id)).by("PRICE_OUTDATED")[0].outcome).toBe("BLOCK");
  });

  it("identifies the price of a different variant", async () => {
    const { campaign } = await setup({ sibling: {}, campaign: { advertisedPrice: "199.00" } });
    const f = (await verify(campaign.id)).by("PRICE_WRONG_VARIANT")[0];
    expect(f.verifiedInfo).toContain('"XL"');
  });

  it("blocks unrecognised dollar amounts written in the copy", async () => {
    const { campaign } = await setup({ campaign: { headline: "Pipeline Jacket, now just $149!" } });
    expect((await verify(campaign.id)).by("COPY_PRICE_UNRECOGNISED")[0].originalClaim).toContain("$149.00");
  });

  it("blocks an overstated percentage but accepts conventional rounding down", async () => {
    // 249.00 → 189.00 is 24.10% off.
    const over = await setup({ campaign: { headline: "Save 25% off", discountType: "PERCENT", discountValue: "25" } });
    expect((await verify(over.campaign.id)).by("DISCOUNT_MISMATCH").length).toBeGreaterThan(0);
    const ok = await setup({ campaign: { headline: "Save 24% off", discountType: "PERCENT", discountValue: "24" } });
    const r = await verify(ok.campaign.id);
    expect(r.by("DISCOUNT_MISMATCH")).toHaveLength(0);
    expect(r.by("DISCOUNT_ARITHMETIC_OK").length).toBeGreaterThan(0);
  });

  it("checks fixed-amount savings against compare-at minus price", async () => {
    const { campaign } = await setup({ campaign: { headline: "Pipeline Jacket", discountType: "FIXED_AMOUNT", discountValue: "50" } });
    const f = (await verify(campaign.id)).by("DISCOUNT_MISMATCH")[0];
    expect(f.verifiedInfo).toContain("$60.00");
  });

  it("blocks a discount when Shopify has no reference price", async () => {
    const { campaign } = await setup({ variant: { compareAtPrice: null }, campaign: { headline: "20% off", discountType: "PERCENT", discountValue: "20" } });
    expect((await verify(campaign.id)).by("DISCOUNT_NO_REFERENCE")[0].outcome).toBe("BLOCK");
  });

  it("re-reads live store data on every run: a price change flips PASS-level pricing to BLOCK", async () => {
    const { campaign, variant } = await setup();
    const before = await verify(campaign.id);
    expect(before.by("PRICE_MATCH")).toHaveLength(1);
    await prisma.productVariant.update({ where: { id: variant.id }, data: { price: "199.00" } });
    const after = await verify(campaign.id);
    expect(after.by("PRICE_MISMATCH")[0].verifiedInfo).toContain("$199.00");
    expect(await prisma.campaignCheck.count({ where: { campaignId: campaign.id } })).toBe(2);
  });
});

describe("inventory errors (inventory tracking and selling policy respected)", () => {
  it("blocks a variant Shopify reports as unavailable", async () => {
    const { campaign } = await setup({ variant: { inventoryQuantity: 0, availableForSale: false } });
    const { by, check } = await verify(campaign.id);
    expect(by("VARIANT_UNAVAILABLE")[0].outcome).toBe("BLOCK");
    expect(check.riskStatus).toBe("BLOCK");
  });

  it("blocks oversold stock (negative quantity) when overselling is not allowed", async () => {
    const { campaign } = await setup({ variant: { inventoryQuantity: -3, inventoryPolicy: "DENY", availableForSale: true } });
    expect((await verify(campaign.id)).by("OUT_OF_STOCK")[0].verifiedInfo).toContain("-3");
  });

  it("does not block zero stock when continue-selling is enabled (backorder → REVIEW)", async () => {
    const { campaign } = await setup({ variant: { inventoryQuantity: 0, inventoryPolicy: "CONTINUE", availableForSale: true } });
    const { by, open } = await verify(campaign.id);
    expect(by("BACKORDER")[0].outcome).toBe("REVIEW");
    expect(open).not.toContain("OUT_OF_STOCK");
  });

  it("applies the merchant's low-stock threshold, and follows changes to it", async () => {
    const atThreshold = await setup({ variant: { inventoryQuantity: 5 } });
    expect((await verify(atThreshold.campaign.id)).by("IN_STOCK")).toHaveLength(1);
    const below = await setup({ variant: { inventoryQuantity: 4 } });
    expect((await verify(below.campaign.id)).by("LOW_STOCK")[0].verifiedInfo).toContain("threshold: 5");
    await prisma.merchantStore.update({ where: { id: storeId }, data: { lowStockThreshold: 3 } });
    expect((await verify(below.campaign.id)).by("IN_STOCK")).toHaveLength(1);
    await prisma.merchantStore.update({ where: { id: storeId }, data: { lowStockThreshold: 5 } });
  });

  it("requires review when stock cannot be verified (untracked, or quantity not accessible)", async () => {
    const untracked = await setup({ variant: { inventoryTracked: false, inventoryQuantity: null } });
    expect((await verify(untracked.campaign.id)).by("INVENTORY_UNTRACKED")[0].outcome).toBe("REVIEW");
    const hidden = await setup({ variant: { inventoryTracked: true, inventoryQuantity: null } });
    expect((await verify(hidden.campaign.id)).by("INVENTORY_UNKNOWN")[0].outcome).toBe("REVIEW");
  });

  it("requires review when no variant is selected (price cannot be verified)", async () => {
    const { campaign } = await setup({ campaign: { noVariant: true } });
    const { by } = await verify(campaign.id);
    expect(by("PRICE_NO_VARIANT")[0].outcome).toBe("REVIEW");
  });
});

describe("expired promotions (exact clock boundaries)", () => {
  it("treats the expiry instant itself as expired", async () => {
    const { campaign } = await setup({ campaign: { endsAt: NOW } });
    expect((await verify(campaign.id)).by("PROMOTION_EXPIRED")[0].outcome).toBe("BLOCK");
  });

  it("is active 1 ms before expiry and expired 1 ms after", async () => {
    const { campaign } = await setup({ campaign: { endsAt: new Date(NOW.getTime() + 1) } });
    const before = await verify(campaign.id, NOW);
    expect(before.by("PROMOTION_EXPIRED")).toHaveLength(0);
    expect(before.by("PROMOTION_ENDING_SOON")).toHaveLength(1);
    const after = await verify(campaign.id, new Date(NOW.getTime() + 2));
    expect(after.by("PROMOTION_EXPIRED")).toHaveLength(1);
    expect(after.check.riskStatus).toBe("BLOCK");
  });

  it("blocks start dates after expiry dates", async () => {
    const { campaign } = await setup({ campaign: { startsAt: new Date(NOW.getTime() + 86_400_000), endsAt: new Date(NOW.getTime() + 3600_000) } });
    expect((await verify(campaign.id)).by("INVALID_DATES")[0].outcome).toBe("BLOCK");
  });

  it("flags discounts with no expiry date for review", async () => {
    const { campaign } = await setup({ campaign: { endsAt: null, headline: "Save 24% off", discountType: "PERCENT", discountValue: "24" } });
    expect((await verify(campaign.id)).by("PROMOTION_NO_EXPIRY")[0].outcome).toBe("REVIEW");
  });

  it("does not report a scheduled (future) offer as expired or active", async () => {
    const { campaign } = await setup({ campaign: { startsAt: new Date(NOW.getTime() + 86_400_000), endsAt: new Date(NOW.getTime() + 5 * 86_400_000) } });
    expect((await verify(campaign.id)).by("PROMOTION_SCHEDULED")).toHaveLength(1);
  });
});

describe("unsupported product claims (evidence-based, never passed on plausibility)", () => {
  it("never passes a claim with no evidence: UNVERIFIABLE → REVIEW", async () => {
    const { campaign } = await setup({ campaign: { claims: ["Keeps you warm at -20°C"] } });
    const { by, check } = await verify(campaign.id);
    expect(by("CLAIM_UNVERIFIABLE")[0].outcome).toBe("REVIEW");
    expect(check.riskStatus).not.toBe("PASS");
  });

  it("ignores AI suggestions as evidence even when marked approved", async () => {
    const { campaign } = await setup({ facts: [{ statement: "Suitable for alpine storms", source: "AI_SUGGESTION", verificationStatus: "AI_SUGGESTION", approved: true }], campaign: { claims: ["Suitable for alpine storms"] } });
    expect((await verify(campaign.id)).by("CLAIM_UNVERIFIABLE")).toHaveLength(1);
  });

  it("ignores unapproved facts until the merchant approves them", async () => {
    const { campaign, product } = await setup({ facts: [{ statement: "Recycled polyester shell", approved: false }], campaign: { claims: ["Recycled polyester shell"] } });
    expect((await verify(campaign.id)).by("CLAIM_UNVERIFIABLE")).toHaveLength(1);
    await prisma.productFact.updateMany({ where: { productId: product.id }, data: { approved: true } });
    const after = await verify(campaign.id);
    expect(after.by("CLAIM_SUPPORTED")).toHaveLength(1);
    expect(after.by("CLAIM_SUPPORTED")[0].sourceEvidence).toContain("Recycled polyester shell");
  });

  it("checks claims written in the copy even if they are not listed as claims", async () => {
    const { campaign } = await setup({ campaign: { headline: "Clinically proven to keep you dry", claims: [] } });
    const f = (await verify(campaign.id)).by("CLAIM_UNVERIFIABLE")[0];
    expect(f.originalClaim).toBe("Clinically proven to keep you dry");
  });

  it("blocks contradicted claims: waterproof vs water-resistant", async () => {
    const { campaign } = await setup({ facts: [{ statement: "Water-resistant polyester fabric", source: "SHOPIFY_METAFIELD", verificationStatus: "VERIFIED" }], campaign: { claims: ["100% waterproof outdoor jacket"] } });
    const f = (await verify(campaign.id)).by("CLAIM_CONTRADICTED")[0];
    expect(f.outcome).toBe("BLOCK");
    expect(f.recommendation).toContain("water-resistant outdoor jacket");
    expect(f.sourceEvidence).toContain("[SHOPIFY_METAFIELD]");
  });

  it("detects negation: 'Machine washable' vs 'Not machine washable'", async () => {
    const { campaign } = await setup({ facts: [{ statement: "Not machine washable" }], campaign: { claims: ["Machine washable"] } });
    expect((await verify(campaign.id)).by("CLAIM_CONTRADICTED")).toHaveLength(1);
  });

  it("requires numbers in a claim to appear in the evidence", async () => {
    const { campaign } = await setup({ facts: [{ statement: "Lasts for years" }], campaign: { claims: ["Lasts 10 years"] } });
    expect((await verify(campaign.id)).by("CLAIM_UNVERIFIABLE")).toHaveLength(1);
  });

  it("detects 'free from X' claims contradicted by 'contains X'", async () => {
    const { campaign } = await setup({ facts: [{ statement: "Contains parabens" }], campaign: { claims: ["Free from parabens"] } });
    expect((await verify(campaign.id)).by("CLAIM_CONTRADICTED")).toHaveLength(1);
  });

  it("requires absolute terms (100%, #1, certified…) to be stated in the evidence", async () => {
    const { campaign } = await setup({ facts: [{ statement: "Made with natural ingredients" }], campaign: { claims: ["100% natural ingredients"] } });
    expect((await verify(campaign.id)).by("CLAIM_UNVERIFIABLE")[0].verifiedInfo).toContain("100%");
  });
});
