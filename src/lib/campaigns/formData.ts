import type { CampaignDefaults, ProductOption } from "@/components/CampaignForm";
import { parseJson, prisma } from "@/lib/db";

export async function productOptions(storeId: string): Promise<ProductOption[]> {
  const products = await prisma.product.findMany({ where: { storeId }, include: { variants: true }, orderBy: { title: "asc" } });
  return products.map((p) => ({
    id: p.id, title: p.title, handle: p.handle, status: p.status, url: p.onlineStoreUrl,
    variants: p.variants.map((v) => ({ id: v.id, title: v.title, price: v.price, compareAtPrice: v.compareAtPrice, sku: v.sku, qty: v.inventoryTracked ? v.inventoryQuantity : null, available: v.availableForSale })),
  }));
}

const local = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export async function campaignDefaults(id?: string): Promise<CampaignDefaults> {
  if (!id) return { name: "", channel: "INSTAGRAM", productId: "", variantId: "", productUrl: "", headline: "", promoText: "", advertisedPrice: "", discountType: "NONE", discountValue: "", startsAt: "", endsAt: "", claims: "", deliveryPromise: "" };
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  return {
    id: c.id, name: c.name, channel: c.channel, productId: c.productId ?? "", variantId: c.variantId ?? "", productUrl: c.productUrl, headline: c.headline, promoText: c.promoText,
    advertisedPrice: c.advertisedPrice ?? "", discountType: c.discountType, discountValue: c.discountValue ?? "", startsAt: local(c.startsAt), endsAt: local(c.endsAt),
    claims: parseJson<string[]>(c.claimsJson, []).join("\n"), deliveryPromise: c.deliveryPromise,
  };
}
