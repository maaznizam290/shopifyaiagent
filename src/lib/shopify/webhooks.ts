import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { audit, prisma } from "@/lib/db";
import { detectChangedProducts, recheckCampaignsForProducts } from "@/lib/monitoring/monitor";
import { syncLiveStore, syncSingleProduct } from "./sync";

export const SUPPORTED_TOPICS = ["products/create", "products/update", "products/delete", "inventory_levels/update"];

/** Shopify signs the raw body with the app's client secret: base64(HMAC-SHA256). */
export function verifyWebhookHmac(rawBody: string | Buffer, hmacHeader: string | null, secret: string | undefined): boolean {
  if (!hmacHeader || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }
  return provided.length === digest.length && crypto.timingSafeEqual(provided, digest);
}

export function webhookSecret(): string | undefined {
  return process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || undefined;
}

export type WebhookOutcome = { status: "processed" | "duplicate" | "ignored"; detail: string };

/**
 * Records the delivery (deduplicated on X-Shopify-Webhook-Id) and re-verifies affected campaigns.
 * Shopify retries deliveries, so identical webhook ids are acknowledged without reprocessing.
 */
export async function processWebhook(args: { webhookId: string; topic: string; shopDomain: string; payload: Record<string, unknown> }): Promise<WebhookOutcome> {
  const store = await prisma.merchantStore.findUnique({ where: { shopDomain: args.shopDomain } });
  try {
    await prisma.webhookEvent.create({ data: { webhookId: args.webhookId, topic: args.topic, shopDomain: args.shopDomain, storeId: store?.id ?? null } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "duplicate", detail: "Webhook already processed" };
    throw e;
  }
  const finish = async (o: WebhookOutcome) => {
    await prisma.webhookEvent.update({ where: { webhookId: args.webhookId }, data: { result: `${o.status}: ${o.detail}` } });
    await audit({ storeId: store?.id, action: "WEBHOOK_RECEIVED", entity: "WebhookEvent", entityId: args.webhookId, detail: { topic: args.topic, ...o } });
    return o;
  };
  if (!store) return finish({ status: "ignored", detail: "Unknown shop" });
  if (!SUPPORTED_TOPICS.includes(args.topic)) return finish({ status: "ignored", detail: `Unsupported topic ${args.topic}` });

  if (store.mode === "LIVE") {
    if (args.topic.startsWith("products/")) {
      const gid = (args.payload.admin_graphql_api_id as string) ?? `gid://shopify/Product/${args.payload.id}`;
      await syncSingleProduct(store.id, gid);
    } else {
      // inventory_levels/update identifies an inventory item, not a product; re-sync the catalogue.
      await syncLiveStore(store.id);
    }
  }
  const changed = await detectChangedProducts(store.id);
  await recheckCampaignsForProducts(changed, "WEBHOOK", `Webhook ${args.topic}`);
  return finish({ status: "processed", detail: `${changed.length} product(s) changed` });
}
