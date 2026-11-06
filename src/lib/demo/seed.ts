import type { PrismaClient } from "@prisma/client";
import { scoreProspect, type ProspectInput } from "@/lib/sales/scoring";

// DEMO DATA. A fictional Australian outdoor retailer. Every record is flagged
// isDemo = true and labelled in the UI. Domains use the reserved .example TLD.

export const DEMO_SHOP = "coastal-trail-demo.myshopify.com";
export const DEMO_PUBLIC = "shop.coastaltrail-demo.example";
const URL = (h: string) => `https://${DEMO_PUBLIC}/products/${h}`;
// Offline placeholder artwork (no external requests in demo mode).
const PALETTE = ["#28B8A5", "#D5A24A", "#94A3B8", "#5B8DEF", "#C9705B", "#7C9A6D"];
const img = (seed: string) => {
  const initials = seed.split("-").slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const color = PALETTE[[...seed].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#172335"/><circle cx="200" cy="200" r="120" fill="${color}" opacity="0.9"/><text x="200" y="228" font-family="Arial" font-size="84" font-weight="700" fill="#101827" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

interface V {
  title: string;
  sku: string;
  price: string;
  compareAt?: string;
  qty: number | null;
  tracked?: boolean;
  policy?: "DENY" | "CONTINUE";
  available?: boolean;
  options: [string, string][];
}
interface P {
  key: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  published?: boolean;
  type: string;
  category: string;
  tags: string[];
  description: string;
  variants: V[];
  facts: { category: string; statement: string; source?: string; status?: string; approved?: boolean }[];
}

const PRODUCTS: P[] = [
  {
    key: "jacket", title: "Ridgeline Rain Jacket", handle: "ridgeline-rain-jacket", status: "ACTIVE", type: "Jackets", category: "Apparel & Accessories > Clothing > Outerwear",
    tags: ["outerwear", "spring-sale"], description: "Lightweight rain shell for hiking and travel. Water-resistant recycled polyester with taped seams.",
    variants: [
      { title: "S / Storm Blue", sku: "RRJ-S-BLU", price: "189.00", compareAt: "249.00", qty: 25, options: [["Size", "S"], ["Colour", "Storm Blue"]] },
      { title: "M / Storm Blue", sku: "RRJ-M-BLU", price: "189.00", compareAt: "249.00", qty: 12, options: [["Size", "M"], ["Colour", "Storm Blue"]] },
      { title: "L / Storm Blue", sku: "RRJ-L-BLU", price: "189.00", compareAt: "249.00", qty: 3, options: [["Size", "L"], ["Colour", "Storm Blue"]] },
    ],
    facts: [
      { category: "MATERIAL", statement: "Water-resistant polyester fabric with taped seams" },
      { category: "MATERIAL", statement: "Outer shell made from recycled polyester" },
      { category: "PERFORMANCE", statement: "Packs into its own chest pocket", source: "MERCHANT_ENTERED", status: "MERCHANT_ENTERED" },
      { category: "PERFORMANCE", statement: "Suitable for alpine storms", source: "AI_SUGGESTION", status: "AI_SUGGESTION", approved: false },
    ],
  },
  {
    key: "runners", title: "Summit Trail Runners", handle: "summit-trail-runners", status: "ACTIVE", type: "Footwear", category: "Apparel & Accessories > Shoes",
    tags: ["footwear"], description: "Grippy trail runners with a rock plate and breathable mesh upper.",
    variants: [
      { title: "US 8", sku: "STR-08", price: "159.95", qty: 30, options: [["Size", "US 8"]] },
      { title: "US 9", sku: "STR-09", price: "159.95", qty: 22, options: [["Size", "US 9"]] },
      { title: "US 10", sku: "STR-10", price: "164.95", qty: 15, options: [["Size", "US 10"]] },
    ],
    facts: [
      { category: "MATERIAL", statement: "Vibram rubber outsole" },
      { category: "DIMENSIONS", statement: "Weight 280 g per shoe (US 9)" },
    ],
  },
  {
    key: "boots", title: "Trailblazer Hiking Boots 2025", handle: "trailblazer-hiking-boots-2025", status: "ARCHIVED", published: false, type: "Footwear", category: "Apparel & Accessories > Shoes",
    tags: ["footwear", "discontinued"], description: "Discontinued 2025 model.",
    variants: [{ title: "US 9", sku: "TBH-09", price: "229.00", qty: 0, available: false, options: [["Size", "US 9"]] }],
    facts: [{ category: "MATERIAL", statement: "Full-grain leather upper" }],
  },
  {
    key: "merino", title: "Alpine Merino Base Layer", handle: "alpine-merino-base-layer", status: "ACTIVE", type: "Base layers", category: "Apparel & Accessories > Clothing > Activewear",
    tags: ["base-layer", "spring-sale"], description: "Soft merino-blend thermal top for cold mornings.",
    variants: [
      { title: "M / Charcoal", sku: "AMB-M-CH", price: "89.00", compareAt: "119.00", qty: 40, options: [["Size", "M"], ["Colour", "Charcoal"]] },
      { title: "L / Charcoal", sku: "AMB-L-CH", price: "89.00", compareAt: "119.00", qty: 18, options: [["Size", "L"], ["Colour", "Charcoal"]] },
    ],
    facts: [
      { category: "MATERIAL", statement: "80% merino wool, 20% nylon blend" },
      { category: "OTHER", statement: "Machine washable on a wool cycle" },
    ],
  },
  {
    key: "tent", title: "Basecamp 2-Person Tent", handle: "basecamp-2-person-tent", status: "ACTIVE", type: "Tents", category: "Sporting Goods > Outdoor Recreation > Camping > Tents",
    tags: ["camping"], description: "Freestanding three-season tent for two.",
    variants: [
      { title: "Olive", sku: "BCT-OLV", price: "349.00", qty: 0, policy: "DENY", available: false, options: [["Colour", "Olive"]] },
      { title: "Sand", sku: "BCT-SND", price: "349.00", qty: 7, options: [["Colour", "Sand"]] },
    ],
    facts: [
      { category: "DIMENSIONS", statement: "Packed weight 2.1 kg" },
      { category: "PERFORMANCE", statement: "Three-season tent rated for wind and rain" },
    ],
  },
  {
    key: "bottle", title: "Trekker Insulated Bottle 750ml", handle: "trekker-insulated-bottle-750ml", status: "ACTIVE", type: "Drinkware", category: "Home & Garden > Kitchen & Dining > Drinkware",
    tags: ["accessories"], description: "Double-wall vacuum insulated bottle.",
    variants: [{ title: "Default", sku: "TIB-750", price: "39.95", qty: null, tracked: false, options: [["Title", "Default"]] }],
    facts: [
      { category: "PERFORMANCE", statement: "Keeps drinks cold for 24 hours" },
      { category: "SAFETY", statement: "BPA-free stainless steel" },
      { category: "DIMENSIONS", statement: "750 ml capacity" },
    ],
  },
  {
    key: "headlamp", title: "Explorer Kids Headlamp", handle: "explorer-kids-headlamp", status: "ACTIVE", type: "Lighting", category: "Sporting Goods > Outdoor Recreation > Camping > Lighting",
    tags: ["kids"], description: "Bright, comfortable headlamp sized for younger explorers.",
    variants: [{ title: "Default", sku: "EKH-01", price: "24.95", qty: 60, options: [["Title", "Default"]] }],
    facts: [
      { category: "AGE", statement: "Recommended for ages 8+" },
      { category: "PERFORMANCE", statement: "Battery life up to 10 hours on low mode" },
      { category: "INCLUDED", statement: "Includes 3 x AAA batteries" },
    ],
  },
  {
    key: "daypack", title: "Canyon Daypack 28L", handle: "canyon-daypack-28l", status: "DRAFT", published: false, type: "Bags", category: "Luggage & Bags > Backpacks",
    tags: ["bags", "no-promo"], description: "Upcoming daypack. Not yet released.",
    variants: [{ title: "Default", sku: "CDP-28", price: "119.00", qty: 0, options: [["Title", "Default"]] }],
    facts: [{ category: "DIMENSIONS", statement: "28 L capacity" }],
  },
  {
    key: "chair", title: "Horizon Camp Chair", handle: "horizon-camp-chair", status: "ACTIVE", type: "Furniture", category: "Sporting Goods > Outdoor Recreation > Camping > Furniture",
    tags: ["camping", "spring-sale"], description: "Folding camp chair with cup holder.",
    variants: [{ title: "Default", sku: "HCC-01", price: "79.00", compareAt: "99.00", qty: 0, policy: "CONTINUE", available: true, options: [["Title", "Default"]] }],
    facts: [{ category: "DIMENSIONS", statement: "Supports up to 120 kg" }],
  },
  {
    key: "sleeping", title: "Nomad Down Sleeping Bag", handle: "nomad-down-sleeping-bag", status: "ACTIVE", type: "Sleeping bags", category: "Sporting Goods > Outdoor Recreation > Camping > Sleeping Bags",
    tags: ["camping"], description: "Responsibly sourced duck down, comfort rating -2°C.",
    variants: [{ title: "Regular", sku: "NDS-REG", price: "299.00", qty: 2, options: [["Length", "Regular"]] }],
    facts: [{ category: "PERFORMANCE", statement: "Comfort temperature rating of -2°C" }, { category: "CERTIFICATION", statement: "RDS certified down" }],
  },
  {
    key: "shirt", title: "Coastal Linen Shirt", handle: "coastal-linen-shirt", status: "ACTIVE", type: "Shirts", category: "Apparel & Accessories > Clothing > Shirts & Tops",
    tags: ["apparel"], description: "Breathable linen-cotton shirt for warm days.",
    variants: [
      { title: "M / Sand", sku: "CLS-M-SND", price: "69.95", qty: 35, options: [["Size", "M"], ["Colour", "Sand"]] },
      { title: "L / Sand", sku: "CLS-L-SND", price: "69.95", qty: 28, options: [["Size", "L"], ["Colour", "Sand"]] },
    ],
    facts: [{ category: "MATERIAL", statement: "55% linen, 45% cotton blend" }],
  },
  {
    key: "stove", title: "Ember Camp Stove", handle: "ember-camp-stove", status: "ACTIVE", published: false, type: "Cooking", category: "Sporting Goods > Outdoor Recreation > Camping > Cooking",
    tags: ["camping"], description: "Compact canister stove. Wholesale only; not sold on the online store.",
    variants: [{ title: "Default", sku: "ECS-01", price: "129.00", qty: 14, options: [["Title", "Default"]] }],
    facts: [{ category: "PERFORMANCE", statement: "Boils 1 L of water in 4 minutes" }],
  },
];

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

const PROSPECTS: (ProspectInput & { outreachStatus: string })[] = [
  { companyName: "Harbourline Digital (DEMO)", contactName: "Alex Demo-Tran", jobTitle: "Agency Owner", website: "https://harbourline.example", linkedinUrl: null, email: "alex@harbourline.example", location: "Sydney, NSW", country: "Australia", industry: "Shopify marketing agency", businessType: "AGENCY_MARKETING", shopifyEvidence: "Shopify Partner directory listing (demo)", shopifyVerified: true, employeeCount: 18, problemHypothesis: "Agency teams may re-check client prices by hand before each campaign launch", notes: "", outreachStatus: "MEETING" },
  { companyName: "Pixelcraft Commerce (DEMO)", contactName: "Jordan Demo-Lee", jobTitle: "Founder", website: "https://pixelcraft.example", linkedinUrl: null, email: null, location: "Melbourne, VIC", country: "Australia", industry: "Shopify development agency", businessType: "AGENCY_DEV", shopifyEvidence: "Shopify Plus partner badge on website (demo)", shopifyVerified: true, employeeCount: 25, problemHypothesis: "", notes: "", outreachStatus: "REPLIED" },
  { companyName: "Saltbush Skincare (DEMO)", contactName: "Sam Demo-Nguyen", jobTitle: "Head of E-commerce", website: "https://saltbush.example", linkedinUrl: null, email: null, location: "Brisbane, QLD", country: "Australia", industry: "Beauty / skincare", businessType: "DTC_BRAND", shopifyEvidence: "Storefront served from myshopify (demo)", shopifyVerified: true, employeeCount: 40, problemHypothesis: "", notes: "", outreachStatus: "MESSAGED" },
  { companyName: "Paws & Co Pet Supplies (DEMO)", contactName: "Riley Demo-Smith", jobTitle: "E-commerce Manager", website: "https://pawsco.example", linkedinUrl: null, email: null, location: "Perth, WA", country: "Australia", industry: "Pet products", businessType: "RETAILER", shopifyEvidence: "", shopifyVerified: false, employeeCount: 12, problemHypothesis: "", notes: "", outreachStatus: "DRAFTED" },
  { companyName: "Little Wanderers Toys (DEMO)", contactName: "Casey Demo-Brown", jobTitle: "CEO", website: "https://littlewanderers.example", linkedinUrl: null, email: null, location: "Adelaide, SA", country: "Australia", industry: "Toys", businessType: "DTC_BRAND", shopifyEvidence: "Checkout page mentions Shopify (demo)", shopifyVerified: false, employeeCount: 9, problemHypothesis: "", notes: "", outreachStatus: "RESEARCHING" },
  { companyName: "Kinfolk Homewares (DEMO)", contactName: "Morgan Demo-Wilson", jobTitle: "Marketing Director", website: "https://kinfolkhome.example", linkedinUrl: null, email: null, location: "Sydney, NSW", country: "Australia", industry: "Homewares", businessType: "RETAILER", shopifyEvidence: "Shopify Partner case study (demo)", shopifyVerified: true, employeeCount: 60, problemHypothesis: "", notes: "", outreachStatus: "PILOT" },
  { companyName: "Threadline Apparel (DEMO)", contactName: "Taylor Demo-Martin", jobTitle: "Head of Growth", website: "https://threadline.example", linkedinUrl: null, email: null, location: "Melbourne, VIC", country: "Australia", industry: "Fashion", businessType: "DTC_BRAND", shopifyEvidence: "Shopify Plus (demo)", shopifyVerified: true, employeeCount: 85, problemHypothesis: "", notes: "", outreachStatus: "NEW" },
  { companyName: "Gold Coast Growth Co (DEMO)", contactName: "Jamie Demo-Clark", jobTitle: "Account Manager", website: "https://gcgrowth.example", linkedinUrl: null, email: null, location: "Gold Coast, QLD", country: "Australia", industry: "Marketing agency", businessType: "AGENCY_MARKETING", shopifyEvidence: "", shopifyVerified: false, employeeCount: 6, problemHypothesis: "", notes: "", outreachStatus: "NEW" },
  { companyName: "Aotearoa Outdoor (DEMO)", contactName: "Drew Demo-Walker", jobTitle: "Founder", website: "https://aotearoaoutdoor.example", linkedinUrl: null, email: null, location: "Auckland", country: "New Zealand", industry: "Outdoor", businessType: "DTC_BRAND", shopifyEvidence: "", shopifyVerified: false, employeeCount: 14, problemHypothesis: "", notes: "Outside initial market", outreachStatus: "NEW" },
  { companyName: "Multistore Retail Group (DEMO)", contactName: "Quinn Demo-Hall", jobTitle: "Head of E-commerce", website: "https://multistore.example", linkedinUrl: null, email: null, location: "Canberra, ACT", country: "Australia", industry: "Multi-channel retail", businessType: "RETAILER", shopifyEvidence: "Multiple Shopify storefronts (demo)", shopifyVerified: true, employeeCount: 220, problemHypothesis: "", notes: "", outreachStatus: "CUSTOMER" },
];

export async function seedDemo(prisma: PrismaClient) {
  await prisma.merchantStore.deleteMany({ where: { isDemo: true } });
  await prisma.prospect.deleteMany({ where: { isDemo: true } });

  const user = await prisma.user.upsert({ where: { email: "demo@promisure.local" }, update: {}, create: { email: "demo@promisure.local", name: "Demo Reviewer", role: "OWNER" } });

  const store = await prisma.merchantStore.create({
    data: { name: "Coastal Trail Outfitters (DEMO)", shopDomain: DEMO_SHOP, publicDomain: DEMO_PUBLIC, mode: "DEMO", isDemo: true, currency: "AUD", lowStockThreshold: 5, lastSyncedAt: new Date(), lastSyncStatus: "OK (demo data)", ownerId: user.id },
  });

  const productIds: Record<string, string> = {};
  const variantIds: Record<string, string> = {};
  let n = 1000;
  for (const p of PRODUCTS) {
    const published = p.published ?? p.status === "ACTIVE";
    const created = await prisma.product.create({
      data: {
        storeId: store.id, shopifyId: `gid://shopify/Product/${++n}`, title: p.title, handle: p.handle, description: p.description, status: p.status,
        onlineStoreUrl: published ? URL(p.handle) : null, publishedOnOnlineStore: published, imageUrl: img(p.handle), imagesJson: JSON.stringify([img(p.handle)]),
        tagsJson: JSON.stringify(p.tags), category: p.category, productType: p.type, vendor: "Coastal Trail", shopifyUpdatedAt: days(-1), isDemo: true,
        variants: {
          create: p.variants.map((v) => ({
            shopifyId: `gid://shopify/ProductVariant/${++n}`, title: v.title, sku: v.sku, price: v.price, compareAtPrice: v.compareAt ?? null,
            optionsJson: JSON.stringify(v.options.map(([name, value]) => ({ name, value }))), inventoryTracked: v.tracked ?? true, inventoryQuantity: v.qty,
            inventoryPolicy: v.policy ?? "DENY", availableForSale: v.available ?? (v.qty === null || v.qty > 0), isDemo: true,
          })),
        },
        facts: {
          create: p.facts.map((f) => ({
            category: f.category, statement: f.statement, source: f.source ?? "SHOPIFY_METAFIELD", verificationStatus: f.status ?? "VERIFIED",
            sourceRef: (f.source ?? "SHOPIFY_METAFIELD") === "SHOPIFY_METAFIELD" ? `promisure.${f.category.toLowerCase()}` : null, approved: f.approved ?? true, isDemo: true,
          })),
        },
      },
      include: { variants: true },
    });
    productIds[p.key] = created.id;
    created.variants.forEach((v) => (variantIds[`${p.key}:${v.title}`] = v.id));
  }

  await prisma.merchantPolicy.createMany({
    data: [
      { storeId: store.id, type: "DISPATCH", name: "Dispatch from Sydney warehouse", minDays: 1, maxDays: 2, detail: "Orders placed before 1pm AEST dispatch next business day", isDemo: true },
      { storeId: store.id, type: "DELIVERY", name: "Standard (AusPost)", minDays: 3, maxDays: 7, detail: "Business days after dispatch", isDemo: true },
      { storeId: store.id, type: "DELIVERY", name: "Express (metro)", minDays: 1, maxDays: 3, detail: "Metro areas only", isDemo: true },
      { storeId: store.id, type: "SHIPPING_SERVICE", name: "Free standard shipping over $150", freeShippingThreshold: "150.00", detail: "Standard service only", isDemo: true },
      { storeId: store.id, type: "GEOGRAPHY", name: "Australia & New Zealand", regionsJson: JSON.stringify(["AU", "AU_NATIONWIDE", "NZ"]), detail: "", isDemo: true },
      { storeId: store.id, type: "RESTRICTION", name: "Remote areas", detail: "Excludes some remote NT and WA postcodes", isDemo: true },
      { storeId: store.id, type: "PROMOTION", name: "Spring Sale 2026 (approved)", maxDiscountPercent: "30", regionsJson: JSON.stringify(["no-promo"]), detail: "Reference prices verified by finance on 2026-09-01. Products tagged no-promo excluded.", isDemo: true },
    ],
  });

  const campaigns = [
    { name: "Spring Rain Jacket – Instagram", channel: "INSTAGRAM", product: "jacket", variant: "jacket:M / Storm Blue", url: URL("ridgeline-rain-jacket"), headline: "Ridgeline Rain Jacket, now $189", promoText: "Save 24% on our water-resistant jacket with taped seams. Free standard shipping on orders over $150.", advertisedPrice: "189.00", discountType: "PERCENT", discountValue: "24", startsAt: days(-3), endsAt: days(10), claims: ["Water-resistant polyester fabric"], deliveryPromise: "Delivery in 3-7 business days", status: "LIVE" },
    { name: "Waterproof Jacket Flash Sale – Facebook", channel: "FACEBOOK", product: "jacket", variant: "jacket:L / Storm Blue", url: URL("ridgeline-rain-jacket"), headline: "100% waterproof jacket, 40% off!", promoText: "Our 100% waterproof outdoor jacket for every adventure. Now only $169. Next-day delivery Australia-wide.", advertisedPrice: "169.00", discountType: "PERCENT", discountValue: "40", startsAt: days(-1), endsAt: days(5), claims: ["100% waterproof outdoor jacket"], deliveryPromise: "Next-day delivery Australia-wide", status: "SUBMITTED" },
    { name: "Merino Base Layer – Google Shopping", channel: "GOOGLE_SHOPPING", product: "merino", variant: "merino:M / Charcoal", url: URL("alpine-merino-base-layer"), headline: "100% merino base layer, 25% off", promoText: "Spring sale ends Sunday. Warm, soft and itch-free.", advertisedPrice: "89.00", discountType: "PERCENT", discountValue: "25", startsAt: days(-20), endsAt: days(-2), claims: ["100% merino wool"], deliveryPromise: "", status: "LIVE" },
    { name: "Basecamp Tent – TikTok", channel: "TIKTOK", product: "tent", variant: "tent:Olive", url: URL("basecamp-2-person-tent"), headline: "The Basecamp tent in Olive, $349", promoText: "Pitch camp fast. Sets up in under 5 minutes.", advertisedPrice: "349.00", discountType: "NONE", discountValue: null, startsAt: days(-2), endsAt: days(14), claims: ["Sets up in under 5 minutes"], deliveryPromise: "Dispatched in 1-2 business days", status: "LIVE" },
    { name: "Trailblazer Boots – Google Ads", channel: "GOOGLE_ADS", product: "boots", variant: "boots:US 9", url: URL("trailblazer-hiking-boots-2025"), headline: "Trailblazer Hiking Boots, $229", promoText: "Full-grain leather hiking boots built for the long haul.", advertisedPrice: "229.00", discountType: "NONE", discountValue: null, startsAt: days(-30), endsAt: null, claims: [], deliveryPromise: "", status: "LIVE" },
    { name: "Kids Headlamp – Email", channel: "EMAIL", product: "headlamp", variant: "headlamp:Default", url: URL("explorer-kids-headlamp"), headline: "Light up their adventures", promoText: "The Explorer headlamp is perfect for kids ages 5+. Battery lasts 20 hours.", advertisedPrice: "24.95", discountType: "NONE", discountValue: null, startsAt: days(-1), endsAt: days(30), claims: ["Perfect for kids ages 5+", "Battery lasts 20 hours"], deliveryPromise: "Free shipping, delivered in 2 days", status: "SUBMITTED" },
    { name: "Camp Chair – Pinterest", channel: "PINTEREST", product: "chair", variant: "chair:Default", url: URL("horizon-camp-chair"), headline: "Horizon Camp Chair, $79 (was $99)", promoText: "Save 20% on our folding camp chair this spring.", advertisedPrice: "79.00", discountType: "PERCENT", discountValue: "20", startsAt: days(-5), endsAt: days(20), claims: ["Supports up to 120 kg"], deliveryPromise: "", status: "APPROVED" },
    { name: "Insulated Bottle – Email (draft)", channel: "EMAIL", product: "bottle", variant: "bottle:Default", url: URL("trekker-insulated-bottle-750ml"), headline: "Cold drinks all day, $39.95", promoText: "Our Trekker bottle keeps drinks cold for 24 hours.", advertisedPrice: "39.95", discountType: "NONE", discountValue: null, startsAt: days(2), endsAt: days(16), claims: ["Keeps drinks cold for 24 hours", "BPA-free"], deliveryPromise: "Delivery in 3-7 business days", status: "DRAFT" },
  ];

  const ids: string[] = [];
  for (const c of campaigns) {
    const snapshot = { ...c };
    const created = await prisma.campaign.create({
      data: {
        storeId: store.id, name: c.name, channel: c.channel, productId: productIds[c.product], variantId: variantIds[c.variant], productUrl: c.url, headline: c.headline, promoText: c.promoText,
        advertisedPrice: c.advertisedPrice, discountType: c.discountType, discountValue: c.discountValue, startsAt: c.startsAt, endsAt: c.endsAt, claimsJson: JSON.stringify(c.claims),
        deliveryPromise: c.deliveryPromise, status: c.status, originalSnapshot: JSON.stringify(snapshot), isDemo: true,
      },
    });
    ids.push(created.id);
  }

  for (const p of PROSPECTS) {
    const { outreachStatus, ...data } = p;
    const s = scoreProspect(data);
    const created = await prisma.prospect.create({ data: { ...data, outreachStatus, leadScore: s.score, scoreBreakdownJson: JSON.stringify(s.breakdown), isDemo: true } });
    const acts: { type: string; detail: string }[] = [{ type: "NOTE", detail: "Added from demo dataset" }];
    const order = ["DRAFTED", "MESSAGED", "REPLIED", "MEETING", "PILOT", "CUSTOMER"];
    const reached = order.indexOf(outreachStatus);
    if (reached >= 1) acts.push({ type: "CONNECTION_SENT", detail: "Connection request sent manually on LinkedIn (demo)" });
    if (reached >= 1) acts.push({ type: "MESSAGE_SENT", detail: "Follow-up message sent manually (demo)" });
    if (reached >= 2) acts.push({ type: "REPLY", detail: "Prospect replied (demo)" });
    if (reached >= 3) acts.push({ type: "MEETING", detail: "Discovery call booked (demo)" });
    if (reached >= 4) acts.push({ type: "PILOT_OFFER", detail: "Pilot offered (demo)" });
    if (reached >= 5) acts.push({ type: "CUSTOMER", detail: "Converted to paying customer (demo)" });
    await prisma.prospectActivity.createMany({ data: acts.map((a, i) => ({ prospectId: created.id, type: a.type, detail: a.detail, occurredAt: days(-20 + i * 3), isDemo: true })) });
  }

  return { storeId: store.id, campaignIds: ids, userId: user.id };
}
