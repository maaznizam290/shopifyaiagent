import { z } from "zod/v4";

export const CHANNELS = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "GOOGLE_SHOPPING", "GOOGLE_ADS", "PINTEREST", "EMAIL", "OTHER"] as const;
export const DISCOUNT_TYPES = ["NONE", "PERCENT", "FIXED_AMOUNT", "COMPARE_AT"] as const;
export const CAMPAIGN_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "LIVE", "PAUSED"] as const;

const money = z
  .string()
  .trim()
  .transform((s) => s.replace(/[$,\s]/g, ""))
  .refine((s) => s === "" || /^\d+(\.\d{1,2})?$/.test(s), "Enter an amount like 49.95");

const optionalDate = z
  .string()
  .trim()
  .transform((s) => (s ? new Date(s) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date");

export const CampaignFormSchema = z
  .object({
    name: z.string().trim().min(2, "Campaign name is required").max(160),
    channel: z.enum(CHANNELS),
    productId: z.string().trim().optional().transform((v) => v || null),
    variantId: z.string().trim().optional().transform((v) => v || null),
    productUrl: z.string().trim().max(2000).refine((u) => u === "" || /^https?:\/\//i.test(u), "URL must start with https://"),
    headline: z.string().trim().max(300),
    promoText: z.string().trim().max(5000),
    advertisedPrice: money.transform((s) => s || null),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: money.transform((s) => s || null),
    startsAt: optionalDate,
    endsAt: optionalDate,
    claims: z.string().max(5000).transform((s) => s.split("\n").map((c) => c.trim()).filter(Boolean)),
    deliveryPromise: z.string().trim().max(500),
    status: z.enum(["DRAFT", "SUBMITTED"]),
  })
  .refine((d) => d.discountType === "NONE" || d.discountType === "COMPARE_AT" || d.discountValue, { message: "Enter the discount value", path: ["discountValue"] })
  .refine((d) => !(d.startsAt && d.endsAt) || d.startsAt <= d.endsAt, { message: "Start date must be before the expiry date", path: ["endsAt"] });

export type CampaignForm = z.infer<typeof CampaignFormSchema>;

export const PolicyFormSchema = z.object({
  type: z.enum(["DISPATCH", "DELIVERY", "SHIPPING_SERVICE", "GEOGRAPHY", "RESTRICTION", "PROMOTION"]),
  name: z.string().trim().min(2).max(160),
  minDays: z.string().trim().transform((s) => (s ? Number.parseInt(s, 10) : null)).refine((n) => n === null || (n >= 0 && n < 365), "Invalid days"),
  maxDays: z.string().trim().transform((s) => (s ? Number.parseInt(s, 10) : null)).refine((n) => n === null || (n >= 0 && n < 365), "Invalid days"),
  regions: z.string().trim().transform((s) => s.split(",").map((r) => r.trim()).filter(Boolean)),
  freeShippingThreshold: money.transform((s) => s || null),
  maxDiscountPercent: money.transform((s) => s || null),
  detail: z.string().trim().max(1000),
});

export const FactFormSchema = z.object({
  productId: z.string().min(1),
  category: z.enum(["MATERIAL", "DIMENSIONS", "COMPATIBILITY", "AGE", "SAFETY", "CERTIFICATION", "INCLUDED", "PERFORMANCE", "OTHER"]),
  statement: z.string().trim().min(3, "Enter the fact").max(1000),
});
