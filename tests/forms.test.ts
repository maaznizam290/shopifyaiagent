import { describe, expect, it } from "vitest";
import { tidy } from "@/lib/ai/correctedCopy";
import { CampaignFormSchema, PolicyFormSchema } from "@/lib/campaigns/schema";

const base = {
  name: "Spring", channel: "INSTAGRAM", productId: "p", variantId: "v", productUrl: "https://shop.example/products/x", headline: "H", promoText: "T",
  advertisedPrice: "$1,299.50", discountType: "PERCENT", discountValue: "20", startsAt: "2026-11-01T10:00", endsAt: "2026-11-10T10:00", claims: "A\n\n B ", deliveryPromise: "", status: "SUBMITTED",
};

describe("Campaign intake validation", () => {
  it("normalises money, dates and claims", () => {
    const r = CampaignFormSchema.parse(base);
    expect(r.advertisedPrice).toBe("1299.50");
    expect(r.claims).toEqual(["A", "B"]);
    expect(r.startsAt).toBeInstanceOf(Date);
  });
  it("rejects invalid input", () => {
    expect(CampaignFormSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(CampaignFormSchema.safeParse({ ...base, channel: "MYSPACE" }).success).toBe(false);
    expect(CampaignFormSchema.safeParse({ ...base, advertisedPrice: "12.345" }).success).toBe(false);
    expect(CampaignFormSchema.safeParse({ ...base, productUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(CampaignFormSchema.safeParse({ ...base, discountValue: "" }).success).toBe(false);
    expect(CampaignFormSchema.safeParse({ ...base, startsAt: "2026-12-01T00:00" }).success).toBe(false);
  });
  it("validates policies", () => {
    expect(PolicyFormSchema.safeParse({ type: "DELIVERY", name: "Std", minDays: "3", maxDays: "7", regions: "AU, NZ", freeShippingThreshold: "", maxDiscountPercent: "", detail: "" }).success).toBe(true);
    expect(PolicyFormSchema.safeParse({ type: "DELIVERY", name: "Std", minDays: "-1", maxDays: "7", regions: "", freeShippingThreshold: "", maxDiscountPercent: "", detail: "" }).success).toBe(false);
  });
});

describe("Copy tidying", () => {
  it("removes dangling punctuation and capitalises", () => {
    expect(tidy("80% merino blend base layer, ")).toBe("80% merino blend base layer");
    expect(tidy("water-resistant jacket ,  24% off!")).toBe("Water-resistant jacket, 24% off!");
  });
});
