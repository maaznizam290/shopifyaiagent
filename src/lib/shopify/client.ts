// Shopify Admin GraphQL client (server-only). Tokens never leave the server.
// Required scopes (least privilege): read_products, read_inventory.

export const DEFAULT_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";

export class ShopifyError extends Error {
  constructor(message: string, public readonly status?: number, public readonly retryable = false) {
    super(message);
  }
}

export interface ShopifyCredentials {
  shopDomain: string; // xyz.myshopify.com
  accessToken?: string; // legacy custom app token / OAuth offline token
  clientId?: string; // Dev Dashboard app (client credentials grant)
  clientSecret?: string;
  apiVersion?: string;
}

let cachedToken: { shop: string; token: string; expiresAt: number } | null = null;

export function normaliseShopDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) throw new ShopifyError("Shop domain must look like your-store.myshopify.com");
  return d;
}

/** Client credentials grant for apps created in the Shopify Dev Dashboard (tokens last ~24h). */
async function getAccessToken(c: ShopifyCredentials): Promise<string> {
  if (c.accessToken) return c.accessToken;
  if (!c.clientId || !c.clientSecret) throw new ShopifyError("No Shopify credentials configured");
  if (cachedToken && cachedToken.shop === c.shopDomain && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch(`https://${c.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }),
  });
  if (!res.ok) throw new ShopifyError(`Token request failed (HTTP ${res.status})`, res.status);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { shop: c.shopDomain, token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export function credentialsFromEnv(): ShopifyCredentials | null {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) return null;
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && !(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)) return null;
  return {
    shopDomain: normaliseShopDomain(shop),
    accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || undefined,
    clientId: process.env.SHOPIFY_CLIENT_ID || undefined,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || undefined,
    apiVersion: DEFAULT_API_VERSION,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { cost?: { requestedQueryCost: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number; maximumAvailable: number } } };
}

export async function shopifyGraphQL<T>(c: ShopifyCredentials, query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  const token = await getAccessToken(c);
  const url = `https://${c.shopDomain}/admin/api/${c.apiVersion ?? DEFAULT_API_VERSION}/graphql.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (attempt < 4) {
      await sleep(500 * 2 ** attempt);
      return shopifyGraphQL(c, query, variables, attempt + 1);
    }
    throw new ShopifyError(`Network error contacting Shopify: ${(e as Error).message}`, undefined, true);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 5) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      return shopifyGraphQL(c, query, variables, attempt + 1);
    }
    throw new ShopifyError(`Shopify HTTP ${res.status} after retries`, res.status, true);
  }
  if (res.status === 401 || res.status === 403) throw new ShopifyError("Shopify rejected the credentials or the app lacks the required scopes (read_products, read_inventory).", res.status);
  if (!res.ok) throw new ShopifyError(`Shopify HTTP ${res.status}`, res.status);

  const body = (await res.json()) as GraphQLResponse<T>;
  const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
  if (throttled) {
    const ts = body.extensions?.cost?.throttleStatus;
    const need = body.extensions?.cost?.requestedQueryCost ?? 100;
    const wait = ts ? Math.max(1, Math.ceil((need - ts.currentlyAvailable) / ts.restoreRate)) : 2;
    if (attempt < 6) {
      await sleep(wait * 1000);
      return shopifyGraphQL(c, query, variables, attempt + 1);
    }
    throw new ShopifyError("Shopify throttled the request repeatedly", 429, true);
  }
  if (body.errors?.length) throw new ShopifyError(`Shopify GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);

  // Proactive pacing: if the bucket is nearly empty, wait for it to refill a little.
  const ts = body.extensions?.cost?.throttleStatus;
  if (ts && ts.currentlyAvailable < ts.maximumAvailable * 0.1) await sleep(1000);
  return body.data as T;
}

// --- Queries --------------------------------------------------------------
// Fields verified against the 2026-10 Admin GraphQL reference.
const VARIANT_FIELDS = `
  id title sku price compareAtPrice availableForSale inventoryPolicy inventoryQuantity
  selectedOptions { name value }
  inventoryItem { tracked }
`;

export const PRODUCTS_QUERY = `
query PromiSureProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle description status onlineStoreUrl updatedAt tags productType vendor
      category { fullName }
      featuredMedia { preview { image { url } } }
      media(first: 5) { nodes { preview { image { url } } } }
      metafields(first: 25, namespace: "promisure") { nodes { namespace key value type } }
      variants(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${VARIANT_FIELDS} } }
    }
  }
}`;

export const PRODUCT_VARIANTS_QUERY = `
query PromiSureVariants($id: ID!, $after: String) {
  product(id: $id) {
    variants(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${VARIANT_FIELDS} } }
  }
}`;

export const PRODUCT_BY_ID_QUERY = `
query PromiSureProduct($id: ID!) {
  product(id: $id) {
    id title handle description status onlineStoreUrl updatedAt tags productType vendor
    category { fullName }
    featuredMedia { preview { image { url } } }
    media(first: 5) { nodes { preview { image { url } } } }
    metafields(first: 25, namespace: "promisure") { nodes { namespace key value type } }
    variants(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${VARIANT_FIELDS} } }
  }
}`;

export const SHOP_QUERY = `query { shop { name myshopifyDomain currencyCode primaryDomain { host } } }`;

export interface ShopifyVariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  inventoryPolicy: string;
  inventoryQuantity: number | null;
  selectedOptions: { name: string; value: string }[];
  inventoryItem: { tracked: boolean } | null;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: string;
  onlineStoreUrl: string | null;
  updatedAt: string;
  tags: string[];
  productType: string;
  vendor: string;
  category: { fullName: string } | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  media: { nodes: { preview: { image: { url: string } | null } | null }[] };
  metafields: { nodes: { namespace: string; key: string; value: string; type: string }[] };
  variants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyVariantNode[] };
}

/** Fetches every product with every variant, following both levels of pagination. */
export async function fetchAllProducts(c: ShopifyCredentials, onPage?: (count: number) => void): Promise<ShopifyProductNode[]> {
  const out: ShopifyProductNode[] = [];
  let after: string | null = null;
  do {
    const data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyProductNode[] } } = await shopifyGraphQL(c, PRODUCTS_QUERY, { first: 50, after });
    for (const p of data.products.nodes) {
      await completeVariants(c, p);
      out.push(p);
    }
    onPage?.(out.length);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}

export async function completeVariants(c: ShopifyCredentials, p: ShopifyProductNode): Promise<void> {
  let vAfter = p.variants.pageInfo.hasNextPage ? p.variants.pageInfo.endCursor : null;
  while (vAfter) {
    const vd: { product: { variants: ShopifyProductNode["variants"] } } = await shopifyGraphQL(c, PRODUCT_VARIANTS_QUERY, { id: p.id, after: vAfter });
    p.variants.nodes.push(...vd.product.variants.nodes);
    vAfter = vd.product.variants.pageInfo.hasNextPage ? vd.product.variants.pageInfo.endCursor : null;
  }
}

export async function fetchProduct(c: ShopifyCredentials, id: string): Promise<ShopifyProductNode | null> {
  const data = await shopifyGraphQL<{ product: ShopifyProductNode | null }>(c, PRODUCT_BY_ID_QUERY, { id });
  if (data.product) await completeVariants(c, data.product);
  return data.product;
}
