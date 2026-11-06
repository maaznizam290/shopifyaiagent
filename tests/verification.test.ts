import { describe, expect, it } from "vitest";
import { analyzeClaimWithRules } from "@/lib/ai/claimRules";
import { generateTemplateCopy, guardCopy } from "@/lib/ai/correctedCopy";
import { mergeClaimAnalyses } from "@/lib/ai/providers";
import { verifyCampaign } from "@/lib/verification/engine";
import { buildResult, classify, scoreFindings } from "@/lib/verification/risk";
import type { Finding } from "@/lib/verification/types";
import { FACTS, makeInput, NOW, VARIANT } from "./fixtures";

const codes = (fs: Finding[]) => fs.map((f) => f.code);
const day = 86_400_000;

describe("1. Valid campaign pricing", () => {
  it("passes when the advertised price and discount match Shopify", () => {
    const r = verifyCampaign(makeInput());
    expect(codes(r.findings)).toContain("PRICE_MATCH");
    expect(codes(r.findings)).toContain("DISCOUNT_ARITHMETIC_OK");
    expect(r.riskStatus).toBe("PASS");
    expect(r.riskScore).toBe(0);
  });
  it("uses decimal arithmetic (no float drift)", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, price: "0.30", compareAtPrice: null }, siblingVariants: [], campaign: { advertisedPrice: "0.3", discountType: "NONE", headline: "Now $0.30", promoText: "" } }));
    expect(codes(r.findings)).toContain("PRICE_MATCH");
  });
});

describe("2. Incorrect advertised pricing", () => {
  it("blocks a price that differs from the live variant", () => {
    const r = verifyCampaign(makeInput({ campaign: { advertisedPrice: "169.00", headline: "Rain Jacket" } }));
    const f = r.findings.find((x) => x.code === "PRICE_MISMATCH")!;
    expect(f.outcome).toBe("BLOCK");
    expect(f.verifiedInfo).toContain("$189.00");
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("detects an outdated price equal to the compare-at price", () => {
    const r = verifyCampaign(makeInput({ campaign: { advertisedPrice: "249.00", headline: "Rain Jacket" } }));
    expect(codes(r.findings)).toContain("PRICE_OUTDATED");
  });
  it("detects the price of a different variant", () => {
    const r = verifyCampaign(makeInput({ campaign: { advertisedPrice: "199.00", headline: "Rain Jacket" } }));
    expect(codes(r.findings)).toContain("PRICE_WRONG_VARIANT");
  });
  it("blocks unrecognised dollar amounts written in the copy", () => {
    const r = verifyCampaign(makeInput({ campaign: { headline: "Now just $149!" } }));
    expect(codes(r.findings)).toContain("COPY_PRICE_UNRECOGNISED");
  });
});

describe("3. Out-of-stock variants", () => {
  it("blocks when the variant cannot be sold", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, inventoryQuantity: 0, availableForSale: false } }));
    expect(codes(r.findings)).toContain("VARIANT_UNAVAILABLE");
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("does not treat zero stock as unsellable when continue-selling is enabled", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, inventoryQuantity: 0, inventoryPolicy: "CONTINUE", availableForSale: true } }));
    const f = r.findings.find((x) => x.type === "INVENTORY")!;
    expect(f.code).toBe("BACKORDER");
    expect(f.outcome).toBe("REVIEW");
  });
  it("flags low stock against the merchant threshold", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, inventoryQuantity: 2 } }));
    expect(codes(r.findings)).toContain("LOW_STOCK");
  });
});

describe("4. Inventory tracking uncertainty", () => {
  it("requires review when inventory is not tracked", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, inventoryTracked: false, inventoryQuantity: null } }));
    expect(codes(r.findings)).toContain("INVENTORY_UNTRACKED");
    expect(r.riskStatus).toBe("REVIEW");
  });
  it("requires review when quantity is not accessible", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, inventoryQuantity: null } }));
    expect(codes(r.findings)).toContain("INVENTORY_UNKNOWN");
  });
});

describe("5. Inactive products", () => {
  it.each(["DRAFT", "ARCHIVED"])("blocks %s products", (status) => {
    const r = verifyCampaign(makeInput({ product: { status } }));
    expect(codes(r.findings)).toContain(`PRODUCT_${status}`);
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("blocks active products that are not on the Online Store channel", () => {
    const r = verifyCampaign(makeInput({ product: { publishedOnOnlineStore: false } }));
    expect(codes(r.findings)).toContain("NOT_ON_ONLINE_STORE");
  });
});

describe("6. Expired promotions", () => {
  it("blocks offers past their expiry", () => {
    const r = verifyCampaign(makeInput({ campaign: { startsAt: new Date(NOW.getTime() - 20 * day), endsAt: new Date(NOW.getTime() - day) } }));
    expect(codes(r.findings)).toContain("PROMOTION_EXPIRED");
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("blocks impossible date ranges", () => {
    const r = verifyCampaign(makeInput({ campaign: { startsAt: new Date(NOW.getTime() + 5 * day), endsAt: new Date(NOW.getTime() + day) } }));
    expect(codes(r.findings)).toContain("INVALID_DATES");
  });
  it("passes scheduled offers that have not started", () => {
    const r = verifyCampaign(makeInput({ campaign: { startsAt: new Date(NOW.getTime() + day), endsAt: new Date(NOW.getTime() + 5 * day) } }));
    expect(codes(r.findings)).toContain("PROMOTION_SCHEDULED");
  });
});

describe("7. Invalid discounts", () => {
  it("blocks a percentage that does not match Shopify pricing", () => {
    const r = verifyCampaign(makeInput({ campaign: { headline: "40% off rain jackets", discountValue: "40" } }));
    expect(r.findings.filter((f) => f.code === "DISCOUNT_MISMATCH").length).toBeGreaterThan(0);
  });
  it("blocks a discount when Shopify has no reference price", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, compareAtPrice: null }, siblingVariants: [] }));
    expect(codes(r.findings)).toContain("DISCOUNT_NO_REFERENCE");
  });
  it("does not treat compare-at price as substantiation without an approved promotion policy", () => {
    const r = verifyCampaign(makeInput({ policies: [] }));
    expect(codes(r.findings)).toContain("REFERENCE_PRICE_UNSUBSTANTIATED");
    expect(r.riskStatus).toBe("REVIEW");
  });
  it("enforces the merchant's maximum discount and excluded tags", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, price: "100.00", compareAtPrice: "200.00" }, campaign: { advertisedPrice: "100.00", headline: "Rain jacket", promoText: "Save 50% off", discountValue: "50" }, product: { tags: ["no-promo"] } }));
    expect(codes(r.findings)).toContain("DISCOUNT_EXCEEDS_POLICY");
    expect(codes(r.findings)).toContain("PRODUCT_INELIGIBLE");
  });
});

describe("8. Contradicted product claims", () => {
  it('classifies "100% waterproof" against "water-resistant" as CONTRADICTED', () => {
    const a = analyzeClaimWithRules("100% waterproof outdoor jacket", FACTS);
    expect(a.classification).toBe("CONTRADICTED");
    expect(a.contradictingFactIds).toEqual(["f1"]);
    expect(a.suggestedRewrite).toBe("water-resistant outdoor jacket");
    const r = verifyCampaign(makeInput({ campaign: { claims: ["100% waterproof outdoor jacket"] } }));
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("detects age recommendation contradictions", () => {
    expect(analyzeClaimWithRules("Great for kids ages 5+", FACTS).classification).toBe("CONTRADICTED");
    expect(analyzeClaimWithRules("Great for kids ages 10+", FACTS).classification).toBe("SUPPORTED");
  });
  it("detects pure-material claims against blends", () => {
    const facts = [{ ...FACTS[0], id: "m", statement: "80% merino wool, 20% nylon blend" }];
    expect(analyzeClaimWithRules("100% merino wool", facts).classification).toBe("CONTRADICTED");
  });
});

describe("9. Unverifiable claims", () => {
  it("never passes a plausible claim without evidence", () => {
    const a = analyzeClaimWithRules("Clinically proven to keep you warm", FACTS);
    expect(a.classification).toBe("UNVERIFIABLE");
    const r = verifyCampaign(makeInput({ campaign: { claims: ["Clinically proven to keep you warm"] } }));
    expect(r.riskStatus).toBe("REVIEW");
  });
  it("ignores AI-suggested and unapproved facts as evidence", () => {
    expect(analyzeClaimWithRules("Suitable for alpine storms", FACTS).classification).toBe("UNVERIFIABLE");
  });
  it("downgrades AI 'SUPPORTED' verdicts that cite no approved fact", () => {
    const rules = [analyzeClaimWithRules("Suitable for alpine storms", FACTS)];
    const merged = mergeClaimAnalyses(rules, [{ ...rules[0], classification: "SUPPORTED", supportingFactIds: ["f3"], analyzer: "ollama:test" }], FACTS);
    expect(merged[0].classification).toBe("UNVERIFIABLE");
  });
  it("keeps rule-detected contradictions even if AI disagrees", () => {
    const rules = [analyzeClaimWithRules("100% waterproof", FACTS)];
    const merged = mergeClaimAnalyses(rules, [{ ...rules[0], classification: "SUPPORTED", supportingFactIds: ["f1"], analyzer: "ollama:test" }], FACTS);
    expect(merged[0].classification).toBe("CONTRADICTED");
  });
});

describe("10. Shipping mismatches", () => {
  it("blocks delivery promises faster than any approved service", () => {
    const r = verifyCampaign(makeInput({ campaign: { deliveryPromise: "Next-day delivery" } }));
    expect(codes(r.findings)).toContain("DELIVERY_PROMISE_EXCEEDS_POLICY");
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("passes promises covered by an approved service", () => {
    const r = verifyCampaign(makeInput({ campaign: { deliveryPromise: "Delivered in 3-7 business days" } }));
    expect(codes(r.findings)).toContain("DELIVERY_PROMISE_OK");
  });
  it("flags unconditional free shipping below the threshold", () => {
    const r = verifyCampaign(makeInput({ variant: { ...VARIANT, price: "40.00", compareAtPrice: null }, siblingVariants: [], campaign: { advertisedPrice: "40.00", discountType: "NONE", headline: "Rain jacket", promoText: "Free shipping!" } }));
    expect(codes(r.findings)).toContain("FREE_SHIPPING_CONDITION_MISSING");
  });
  it("blocks regions outside approved geography", () => {
    const r = verifyCampaign(makeInput({ campaign: { deliveryPromise: "We ship worldwide" } }));
    expect(codes(r.findings)).toContain("REGION_NOT_SERVED");
  });
});

describe("11. Broken product links", () => {
  it("blocks 404 destinations", () => {
    const r = verifyCampaign(makeInput({ destination: { status: "NOT_FOUND", requestedUrl: "", finalUrl: "x", httpStatus: 404, redirectChain: [], resolvedHandle: "rain-jacket", simulated: false, message: "Not found" } }));
    expect(codes(r.findings)).toContain("BROKEN_LINK");
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("blocks redirects to a different product", () => {
    const r = verifyCampaign(makeInput({ destination: { status: "OK", requestedUrl: "", finalUrl: "x", httpStatus: 200, redirectChain: ["x"], resolvedHandle: "other-product", simulated: false, message: "" } }));
    expect(codes(r.findings)).toContain("HANDLE_MISMATCH");
  });
  it("blocks destinations outside the merchant's domains", () => {
    const r = verifyCampaign(makeInput({ destination: { status: "DISALLOWED", requestedUrl: "", finalUrl: null, httpStatus: null, redirectChain: [], resolvedHandle: null, simulated: false, message: "not allowed" } }));
    expect(codes(r.findings)).toContain("URL_DISALLOWED");
  });
});

describe("12. Risk-score calculation", () => {
  const mk = (severity: Finding["severity"], outcome: Finding["outcome"]): Finding => ({ type: "PRICE", code: `${severity}_${outcome}`, severity, outcome, originalClaim: "", verifiedInfo: "", sourceEvidence: "", recommendation: "", timestamp: "" });
  it("sums non-passing severities transparently and caps at 100", () => {
    expect(scoreFindings([mk("LOW", "REVIEW"), mk("MEDIUM", "REVIEW")]).total).toBe(17);
    expect(scoreFindings([mk("CRITICAL", "BLOCK"), mk("CRITICAL", "BLOCK"), mk("CRITICAL", "BLOCK")]).total).toBe(100);
    expect(scoreFindings([mk("HIGH", "PASS")]).total).toBe(0);
  });
  it("never lets a low score override a BLOCK", () => {
    const r = buildResult([mk("LOW", "BLOCK")]);
    expect(r.riskScore).toBe(5);
    expect(r.riskStatus).toBe("BLOCK");
  });
  it("classifies PASS / REVIEW / BLOCK by worst outcome", () => {
    expect(classify([mk("INFO", "PASS")])).toBe("PASS");
    expect(classify([mk("INFO", "PASS"), mk("LOW", "REVIEW")])).toBe("REVIEW");
    expect(classify([mk("LOW", "REVIEW"), mk("HIGH", "BLOCK")])).toBe("BLOCK");
  });
});

describe("13. Corrected copy generation", () => {
  it("produces grounded copy that fixes price, discount and claims", () => {
    const input = makeInput({ campaign: { advertisedPrice: "169.00", headline: "100% waterproof jacket, 40% off!", promoText: "Our 100% waterproof jacket. Now only $169.", discountValue: "40", claims: ["100% waterproof jacket"] } });
    const r = verifyCampaign(input);
    const copy = generateTemplateCopy(input, r.findings, input.claimAnalyses);
    expect(copy.headline).not.toMatch(/waterproof/i);
    expect(copy.headline).toMatch(/water-resistant/i);
    expect(copy.headline).toContain("24% off");
    expect(copy.marketingText).toContain("$189.00");
    expect(copy.marketingText).not.toContain("$169");
    expect(copy.productDescription).toContain("Water-resistant polyester fabric");
    expect(copy.productDescription).not.toContain("alpine storms"); // AI suggestion excluded
    expect(guardCopy(copy, input, input.claimAnalyses)).toEqual([]);
  });
  it("guard rejects AI copy that invents prices or repeats contradicted claims", () => {
    const input = makeInput({ campaign: { claims: ["100% waterproof jacket"] } });
    const problems = guardCopy({ headline: "100% waterproof jacket for $99", marketingText: "", productDescription: "", cta: "Buy", explanation: "" }, input, input.claimAnalyses);
    expect(problems.some((p) => p.includes("$99"))).toBe(true);
    expect(problems.some((p) => /waterproof/.test(p))).toBe(true);
  });
  it("removes expired offer language and changes CTA for unavailable stock", () => {
    const input = makeInput({ variant: { ...VARIANT, inventoryQuantity: 0, availableForSale: false }, campaign: { endsAt: new Date(NOW.getTime() - day), startsAt: new Date(NOW.getTime() - 9 * day), promoText: "Sale ends Sunday. Built for the trail." } });
    const r = verifyCampaign(input);
    const copy = generateTemplateCopy(input, r.findings, []);
    expect(copy.marketingText).not.toMatch(/ends Sunday/);
    expect(copy.cta).toMatch(/notified/i);
  });
});

describe("Claim analysis regressions (negation, numbers, free-from, absolutes)", () => {
  const fact = (statement: string) => [{ id: "x", category: "OTHER", statement, source: "MERCHANT_ENTERED", verificationStatus: "MERCHANT_ENTERED", approved: true }];
  it.each([
    ["Machine washable", "Not machine washable", "CONTRADICTED"],
    ["Machine washable", "Machine washable, do not tumble dry", "SUPPORTED"],
    ["Suitable for children", "Not suitable for children under 3", "CONTRADICTED"],
    ["Safe for children", "Not safe for children under 3", "CONTRADICTED"],
    ["Non-toxic paint", "Non-toxic water-based paint", "SUPPORTED"],
    ["Lasts 10 years", "Lasts for years", "UNVERIFIABLE"],
    ["Lasts 10 years", "Lasts 10 years with normal use", "SUPPORTED"],
    ["Free from parabens", "Contains parabens", "CONTRADICTED"],
    ["Paraben-free formula", "Formula is paraben-free", "SUPPORTED"],
    ["100% natural ingredients", "Made with natural ingredients", "UNVERIFIABLE"],
    ["#1 rated jacket", "Rated jacket by Outdoor Mag", "UNVERIFIABLE"],
    ["Holds 5 litres", "Holds 2 litres", "CONTRADICTED"],
  ])('"%s" vs fact "%s" → %s', (claim, statement, expected) => {
    expect(analyzeClaimWithRules(claim, fact(statement)).classification).toBe(expected);
  });
});
