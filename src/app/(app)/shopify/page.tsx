import { CheckCircle2, Circle, PlugZap, RefreshCw } from "lucide-react";
import { connectShopify, switchStore, syncShopify } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, fmtDate, KeyValue, PageHeader, Pill } from "@/components/ui";
import { prisma } from "@/lib/db";
import { credentialsFromEnv, DEFAULT_API_VERSION } from "@/lib/shopify/client";
import { SUPPORTED_TOPICS, webhookSecret } from "@/lib/shopify/webhooks";
import { getActiveStore } from "@/lib/settings";

/** One configuration requirement: the env var(s) to set, ticked when present. */
function Requirement({ ok, name }: { ok: boolean; name: string }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Icon size={16} className={ok ? "text-pass" : "text-steel"} aria-label={ok ? "Set" : "Missing"} />
      <code className={ok ? "text-ink" : "text-muted"}>{name}</code>
    </li>
  );
}

export default async function ShopifyPage({ searchParams }: { searchParams: SP }) {
  const active = await getActiveStore();
  const stores = await prisma.merchantStore.findMany({ include: { _count: { select: { products: true, campaigns: true } } }, orderBy: { createdAt: "asc" } });
  const creds = credentialsFromEnv();
  const webhooks = await prisma.webhookEvent.findMany({ orderBy: { processedAt: "desc" }, take: 5 });

  return (
    <>
      <PageHeader
        title="Shopify"
        actions={<>
          {active && !active.isDemo && <form action={syncShopify}><button className="btn btn-secondary"><RefreshCw size={15} />Sync</button></form>}
          <form action={connectShopify}><button className="btn btn-primary" disabled={!creds}><PlugZap size={15} />Connect</button></form>
        </>}
      />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Stores" pad={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Store</th><th>Mode</th><th className="text-right">Products</th><th className="text-right">Campaigns</th><th>Last sync</th><th></th></tr></thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.id}>
                      <td><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.shopDomain}</div></td>
                      <td><Pill tone={s.mode === "LIVE" ? "teal" : "brass"}>{s.mode === "LIVE" ? "Live" : "Demo"}</Pill></td>
                      <td className="text-right tabular-nums">{s._count.products}</td>
                      <td className="text-right tabular-nums">{s._count.campaigns}</td>
                      <td className="text-xs"><div>{fmtDate(s.lastSyncedAt, true)}</div>{s.lastSyncStatus === "ERROR" && <div className="text-block">{s.lastSyncError}</div>}</td>
                      <td className="text-right">{s.id === active?.id ? <Pill tone="ink">Active</Pill> : <form action={switchStore}><input type="hidden" name="storeId" value={s.id} /><button className="btn btn-secondary btn-sm">Make active</button></form>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Webhooks" pad={false}>
            <ul className="divide-y divide-line">
              {webhooks.map((w) => <li key={w.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><code>{w.topic}</code><span className="text-xs text-muted">{w.result} · {fmtDate(w.processedAt, true)}</span></li>)}
              {webhooks.length === 0 && <li className="px-5 py-3 text-sm text-muted">None received</li>}
            </ul>
          </Card>
        </div>

        <Card title="Configuration">
          <ul className="space-y-2.5">
            <Requirement ok={!!process.env.SHOPIFY_SHOP_DOMAIN} name="SHOPIFY_SHOP_DOMAIN" />
            <Requirement ok={!!creds} name={process.env.SHOPIFY_CLIENT_ID ? "SHOPIFY_CLIENT_ID + SECRET" : "SHOPIFY_ADMIN_ACCESS_TOKEN"} />
            <Requirement ok={!!webhookSecret()} name="SHOPIFY_WEBHOOK_SECRET" />
          </ul>
          <div className="mt-5 border-t border-line pt-5">
            <KeyValue columns={1} items={[
              ["API version", DEFAULT_API_VERSION],
              ["Scopes", <code key="s">read_products, read_inventory</code>],
              ["Webhook URL", <code key="w">POST /api/webhooks/shopify</code>],
              ["Topics", <span key="t" className="text-xs">{SUPPORTED_TOPICS.join(", ")}</span>],
            ]} />
          </div>
        </Card>
      </div>
    </>
  );
}
