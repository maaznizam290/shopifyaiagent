import { NextResponse } from "next/server";
import { processWebhook, verifyWebhookHmac, webhookSecret } from "@/lib/shopify/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text(); // HMAC must be computed over the raw body
  if (!verifyWebhookHmac(raw, req.headers.get("x-shopify-hmac-sha256"), webhookSecret())) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const webhookId = req.headers.get("x-shopify-webhook-id");
  const topic = req.headers.get("x-shopify-topic");
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  if (!webhookId || !topic || !shopDomain) return NextResponse.json({ error: "Missing Shopify headers" }, { status: 400 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const outcome = await processWebhook({ webhookId, topic, shopDomain, payload });
    return NextResponse.json(outcome);
  } catch (e) {
    console.error("[webhook] processing failed", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Shopify will retry
  }
}
