import { analyzeClaimWithRules } from "@/lib/ai/claimRules";
import type { FactInput, PolicyInput, VariantInput, VerificationInput } from "@/lib/verification/types";

export const NOW = new Date("2026-11-04T00:00:00Z");
const d = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

export const VARIANT: VariantInput = {
  id: "v-m", title: "M / Blue", sku: "J-M", price: "189.00", compareAtPrice: "249.00",
  inventoryTracked: true, inventoryQuantity: 20, inventoryPolicy: "DENY", availableForSale: true,
};

export const FACTS: FactInput[] = [
  { id: "f1", category: "MATERIAL", statement: "Water-resistant polyester fabric with taped seams", source: "SHOPIFY_METAFIELD", verificationStatus: "VERIFIED", approved: true },
  { id: "f2", category: "AGE", statement: "Recommended for ages 8+", source: "MERCHANT_ENTERED", verificationStatus: "MERCHANT_ENTERED", approved: true },
  { id: "f3", category: "PERFORMANCE", statement: "Suitable for alpine storms", source: "AI_SUGGESTION", verificationStatus: "AI_SUGGESTION", approved: false },
];

export const POLICIES: PolicyInput[] = [
  { id: "p1", type: "DELIVERY", name: "Standard", minDays: 3, maxDays: 7, regions: [], freeShippingThreshold: null, maxDiscountPercent: null, detail: "", active: true },
  { id: "p2", type: "DELIVERY", name: "Express", minDays: 2, maxDays: 3, regions: [], freeShippingThreshold: null, maxDiscountPercent: null, detail: "", active: true },
  { id: "p3", type: "SHIPPING_SERVICE", name: "Free over $150", minDays: null, maxDays: null, regions: [], freeShippingThreshold: "150.00", maxDiscountPercent: null, detail: "", active: true },
  { id: "p4", type: "GEOGRAPHY", name: "AU", minDays: null, maxDays: null, regions: ["AU", "AU_NATIONWIDE"], freeShippingThreshold: null, maxDiscountPercent: null, detail: "", active: true },
  { id: "p5", type: "PROMOTION", name: "Spring", minDays: null, maxDays: null, regions: ["no-promo"], freeShippingThreshold: null, maxDiscountPercent: "30", detail: "", active: true },
];

export function makeInput(over: Partial<{ [K in keyof VerificationInput]: Partial<VerificationInput[K]> | VerificationInput[K] }> = {}): VerificationInput {
  const base: VerificationInput = {
    now: NOW,
    campaign: {
      name: "Test", channel: "INSTAGRAM", productUrl: "https://shop.test.example/products/rain-jacket", headline: "Rain Jacket, now $189",
      promoText: "Save 24% this spring.", advertisedPrice: "189.00", discountType: "PERCENT", discountValue: "24",
      startsAt: d(-1), endsAt: d(10), claims: [], deliveryPromise: "", status: "LIVE",
    },
    product: { id: "p", title: "Rain Jacket", handle: "rain-jacket", status: "ACTIVE", publishedOnOnlineStore: true, onlineStoreUrl: "https://shop.test.example/products/rain-jacket", tags: [], syncedAt: NOW },
    variant: VARIANT,
    siblingVariants: [VARIANT, { ...VARIANT, id: "v-xl", title: "XL / Blue", price: "199.00" }],
    facts: FACTS,
    policies: POLICIES,
    store: { shopDomain: "test.myshopify.com", publicDomain: "shop.test.example", lowStockThreshold: 5, currency: "AUD" },
    destination: { status: "OK", requestedUrl: "", finalUrl: "https://shop.test.example/products/rain-jacket", httpStatus: 200, redirectChain: [], resolvedHandle: "rain-jacket", simulated: true, message: "" },
    claimAnalyses: [],
  };
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const cur = (base as unknown as Record<string, unknown>)[k];
    out[k] = v && cur && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? { ...(cur as object), ...(v as object) } : v;
  }
  const input = out as unknown as VerificationInput;
  if (!over.claimAnalyses) input.claimAnalyses = input.campaign.claims.map((c) => analyzeClaimWithRules(c, input.facts));
  return input;
}
