import { CheckCircle2, CircleAlert, PlugZap, RefreshCw } from "lucide-react";
import { connectShopify, switchStore, syncShopify } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, fmtDate, KeyValue, Notice, PageHeader, Pill } from "@/components/ui";
import { prisma } from "@/lib/db";
import { credentialsFromEnv, DEFAULT_API_VERSION } from "@/lib/shopify/client";
import { webhookSecret, SUPPORTED_TOPICS } from "@/lib/shopify/webhooks";
import { getActiveStore } from "@/lib/settings";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-pass" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-steel" />}
      <div><div className={ok ? "text-ink" : "text-muted"}>{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div>
    </li>
  );
}

export default async function ShopifyPage({ searchParams }: { searchParams: SP }) {
  const active = await getActiveStore();
  const stores = await prisma.merchantStore.findMany({ include: { _count: { select: { products: true, campaigns: true } } }, orderBy: { createdAt: "asc" } });
  const creds = credentialsFromEnv();
  const env = {
    shop: !!process.env.SHOPIFY_SHOP_DOMAIN,
    token: !!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    client: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
    webhook: !!webhookSecret(),
  };
  const webhooks = await prisma.webhookEvent.findMany({ orderBy: { processedAt: "desc" }, take: 5 });

  return (
    <>
      <PageHeader eyebrow="Shopify Connection" title="Store connection" subtitle="Read-only access to products, variants, pricing and inventory through the Shopify Admin GraphQL API. Tokens stay on the server." />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Connected stores" pad={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Store</th><th>Mode</th><th>Products</th><th>Campaigns</th><th>Last sync</th><th></th></tr></thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.id}>
                      <td><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.shopDomain}</div></td>
                      <td><Pill tone={s.mode === "LIVE" ? "teal" : "brass"}>{s.mode === "LIVE" ? "LIVE" : "DEMO DATA"}</Pill></td>
                      <td className="tabular-nums">{s._count.products}</td>
                      <td className="tabular-nums">{s._count.campaigns}</td>
                      <td className="text-xs"><div>{fmtDate(s.lastSyncedAt, true)}</div><div className={s.lastSyncStatus === "ERROR" ? "text-block" : "text-muted"}>{s.lastSyncStatus}{s.lastSyncError ? `: ${s.lastSyncError}` : ""}</div></td>
                      <td className="text-right">{s.id === active?.id ? <Pill tone="ink">Active</Pill> : <form action={switchStore}><input type="hidden" name="storeId" value={s.id} /><button className="btn btn-secondary btn-sm">Make active</button></form>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Connect a live Shopify store" actions={<>
            {active && !active.isDemo && <form action={syncShopify}><button className="btn btn-secondary btn-sm"><RefreshCw size={14} />Sync now</button></form>}
            <form action={connectShopify}><button className="btn btn-primary btn-sm" disabled={!creds}><PlugZap size={14} />Test &amp; connect</button></form>
          </>}>
            {!creds && <div className="mb-4"><Notice tone="warn" title="No Shopify credentials configured">Demo mode is active. Add credentials to <code>.env</code> (see <code>.env.example</code>) and restart the server to connect a real store. Integration results are never simulated for live stores.</Notice></div>}
            <ul className="space-y-2.5">
              <Check ok={env.shop} label="SHOPIFY_SHOP_DOMAIN" hint={process.env.SHOPIFY_SHOP_DOMAIN || "e.g. your-store.myshopify.com"} />
              <Check ok={env.token || env.client} label="Credentials" hint={env.token ? "Admin API access token (existing custom app)" : env.client ? "Dev Dashboard app: client credentials grant (token refreshed every 24h)" : "SHOPIFY_ADMIN_ACCESS_TOKEN, or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET"} />
              <Check ok label={`Admin GraphQL API version ${DEFAULT_API_VERSION}`} hint="Override with SHOPIFY_API_VERSION" />
              <Check ok={env.webhook} label="Webhook HMAC secret" hint={env.webhook ? "Configured" : "Uses SHOPIFY_WEBHOOK_SECRET or SHOPIFY_CLIENT_SECRET"} />
            </ul>
            <div className="mt-5 grid gap-4 border-t border-line pt-5 text-sm md:grid-cols-2">
              <div>
                <div className="label">Required scopes (least privilege)</div>
                <ul className="space-y-1"><li><code>read_products</code>: products, variants, prices, metafields</li><li><code>read_inventory</code>: inventory quantities and tracking</li></ul>
                <p className="mt-2 text-xs text-muted">PromiSure AI requests no write scopes. It cannot change prices, inventory or products.</p>
              </div>
              <div>
                <div className="label">Webhook endpoint</div>
                <code className="block break-all rounded bg-cloud px-2 py-1 text-xs">POST /api/webhooks/shopify</code>
                <p className="mt-2 text-xs text-muted">Subscribe to: {SUPPORTED_TOPICS.join(", ")}. Requests are HMAC-verified and de-duplicated by <code>X-Shopify-Webhook-Id</code>. Your public URL must be HTTPS (e.g. through a tunnel during development).</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Active store">
            {active ? <KeyValue items={[["Name", active.name], ["Domain", active.shopDomain], ["Storefront", active.publicDomain ?? "—"], ["Currency", active.currency], ["Mode", active.mode], ["API version", active.isDemo ? "n/a (demo)" : active.apiVersion]]} /> : "None"}
          </Card>
          <Card title="Installing for other merchants">
            <div className="space-y-2 text-sm text-muted">
              <p>Developer-store tokens are for your own store only. For external merchants, PromiSure AI must be distributed as a Shopify app using the <b className="text-ink">authorization code grant (OAuth)</b>:</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs">
                <li>Create the app in the Shopify Dev Dashboard and set the redirect URL.</li>
                <li>Request only <code>read_products,read_inventory</code>.</li>
                <li>Verify the HMAC and <code>state</code> on the callback, exchange the code for an offline token, and store it encrypted per <code>MerchantStore</code>.</li>
                <li>Register webhooks per shop, including <code>app/uninstalled</code> and the mandatory privacy topics.</li>
              </ol>
              <p className="text-xs">See README → “Production OAuth”.</p>
            </div>
          </Card>
          <Card title="Recent webhook deliveries" pad={false}>
            <ul className="divide-y divide-line">
              {webhooks.map((w) => <li key={w.id} className="px-5 py-2.5 text-xs"><div className="font-medium text-ink">{w.topic}</div><div className="text-muted">{fmtDate(w.processedAt, true)} · {w.result}</div></li>)}
              {webhooks.length === 0 && <li className="px-5 py-3 text-sm text-muted">No webhooks received.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
