import crypto from "node:crypto";
import { audit, prisma } from "@/lib/db";
import { credentialsFromEnv, fetchAllProducts, fetchProduct, type ShopifyCredentials, type ShopifyProductNode, shopifyGraphQL, SHOP_QUERY } from "./client";

export function productHash(p: { status: string; title: string; handle: string; onlineStoreUrl: string | null; variants: { id: string; price: string; compareAtPrice: string | null; inventoryQuantity: number | null; availableForSale: boolean; inventoryPolicy: string }[]; facts?: string[] }): string {
  const payload = JSON.stringify({
    s: p.status,
    t: p.title,
    h: p.handle,
    u: p.onlineStoreUrl,
    v: [...p.variants].sort((a, b) => a.id.localeCompare(b.id)).map((v) => [v.id, v.price, v.compareAtPrice, v.inventoryQuantity, v.availableForSale, v.inventoryPolicy]),
    f: p.facts ?? [],
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/** Metafields in the "promisure" namespace are treated as merchant-approved facts. */
function metafieldFacts(node: ShopifyProductNode) {
  return node.metafields.nodes
    .filter((m) => m.value && m.value.length < 2000)
    .map((m) => ({ category: m.key.toUpperCase().replace(/[^A-Z]/g, "_").slice(0, 30) || "OTHER", statement: m.value, sourceRef: `${m.namespace}.${m.key}` }));
}

/** Upserts one Shopify product. Returns ids of local products whose facts changed. */
export async function upsertShopifyProduct(storeId: string, node: ShopifyProductNode): Promise<{ productId: string; changed: boolean }> {
  const variants = node.variants.nodes;
  const mfFacts = metafieldFacts(node);
  const hash = productHash({ ...node, variants, facts: mfFacts.map((f) => `${f.sourceRef}=${f.statement}`) });
  const existing = await prisma.product.findUnique({ where: { storeId_shopifyId: { storeId, shopifyId: node.id } } });
  const images = [node.featuredMedia?.preview?.image?.url, ...node.media.nodes.map((m) => m.preview?.image?.url)].filter(Boolean) as string[];
  const data = {
    title: node.title,
    handle: node.handle,
    description: node.description,
    status: node.status,
    onlineStoreUrl: node.onlineStoreUrl,
    publishedOnOnlineStore: !!node.onlineStoreUrl,
    imageUrl: images[0] ?? null,
    imagesJson: JSON.stringify([...new Set(images)]),
    tagsJson: JSON.stringify(node.tags),
    category: node.category?.fullName ?? null,
    productType: node.productType || null,
    vendor: node.vendor || null,
    shopifyUpdatedAt: new Date(node.updatedAt),
    syncedAt: new Date(),
    contentHash: hash,
  };
  const product = existing
    ? await prisma.product.update({ where: { id: existing.id }, data })
    : await prisma.product.create({ data: { ...data, storeId, shopifyId: node.id } });

  const seen: string[] = [];
  for (const v of variants) {
    seen.push(v.id);
    const vData = {
      title: v.title,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      optionsJson: JSON.stringify(v.selectedOptions),
      inventoryTracked: v.inventoryItem?.tracked ?? false,
      inventoryQuantity: v.inventoryQuantity,
      inventoryPolicy: v.inventoryPolicy,
      availableForSale: v.availableForSale,
    };
    await prisma.productVariant.upsert({
      where: { productId_shopifyId: { productId: product.id, shopifyId: v.id } },
      update: vData,
      create: { ...vData, productId: product.id, shopifyId: v.id },
    });
  }
  await prisma.productVariant.deleteMany({ where: { productId: product.id, shopifyId: { notIn: seen } } });

  // Re-sync metafield-sourced facts (merchant-entered facts are never touched).
  await prisma.productFact.deleteMany({ where: { productId: product.id, source: "SHOPIFY_METAFIELD" } });
  if (mfFacts.length) {
    await prisma.productFact.createMany({
      data: mfFacts.map((f) => ({ productId: product.id, category: f.category, statement: f.statement, source: "SHOPIFY_METAFIELD", verificationStatus: "VERIFIED", sourceRef: f.sourceRef, approved: true })),
    });
  }
  return { productId: product.id, changed: !existing || existing.contentHash !== hash };
}

export interface SyncResult {
  ok: boolean;
  products: number;
  changedProductIds: string[];
  error?: string;
}

export async function syncLiveStore(storeId: string, creds: ShopifyCredentials | null = credentialsFromEnv()): Promise<SyncResult> {
  if (!creds) return { ok: false, products: 0, changedProductIds: [], error: "Shopify credentials are not configured (see .env.example)." };
  try {
    const nodes = await fetchAllProducts(creds);
    const changed: string[] = [];
    for (const n of nodes) {
      const r = await upsertShopifyProduct(storeId, n);
      if (r.changed) changed.push(r.productId);
    }
    await prisma.merchantStore.update({ where: { id: storeId }, data: { lastSyncedAt: new Date(), lastSyncStatus: "OK", lastSyncError: null } });
    await audit({ storeId, action: "SHOPIFY_SYNC", entity: "MerchantStore", entityId: storeId, detail: { products: nodes.length, changed: changed.length } });
    return { ok: true, products: nodes.length, changedProductIds: changed };
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.merchantStore.update({ where: { id: storeId }, data: { lastSyncStatus: "ERROR", lastSyncError: msg } });
    return { ok: false, products: 0, changedProductIds: [], error: msg };
  }
}

export async function syncSingleProduct(storeId: string, shopifyProductId: string, creds: ShopifyCredentials | null = credentialsFromEnv()) {
  if (!creds) throw new Error("Shopify credentials are not configured");
  const node = await fetchProduct(creds, shopifyProductId);
  if (!node) {
    const p = await prisma.product.findUnique({ where: { storeId_shopifyId: { storeId, shopifyId: shopifyProductId } } });
    if (p) await prisma.product.update({ where: { id: p.id }, data: { status: "ARCHIVED", publishedOnOnlineStore: false, syncedAt: new Date() } });
    return p ? { productId: p.id, changed: true } : null;
  }
  return upsertShopifyProduct(storeId, node);
}

/** Creates (or returns) the LIVE store record using env credentials, after a test call. */
export async function connectLiveStore(): Promise<{ ok: boolean; storeId?: string; error?: string; shop?: string }> {
  const creds = credentialsFromEnv();
  if (!creds) return { ok: false, error: "Set SHOPIFY_SHOP_DOMAIN and either SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET in .env, then restart." };
  try {
    const data = await shopifyGraphQL<{ shop: { name: string; myshopifyDomain: string; currencyCode: string; primaryDomain: { host: string } } }>(creds, SHOP_QUERY);
    const store = await prisma.merchantStore.upsert({
      where: { shopDomain: data.shop.myshopifyDomain },
      update: { name: data.shop.name, currency: data.shop.currencyCode, publicDomain: data.shop.primaryDomain.host, mode: "LIVE", apiVersion: creds.apiVersion ?? "" },
      create: { name: data.shop.name, shopDomain: data.shop.myshopifyDomain, currency: data.shop.currencyCode, publicDomain: data.shop.primaryDomain.host, mode: "LIVE", isDemo: false, apiVersion: creds.apiVersion ?? "" },
    });
    await audit({ storeId: store.id, action: "SHOPIFY_CONNECTED", entity: "MerchantStore", entityId: store.id, detail: { shop: data.shop.myshopifyDomain } });
    return { ok: true, storeId: store.id, shop: data.shop.myshopifyDomain };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
