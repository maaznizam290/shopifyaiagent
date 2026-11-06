import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { addFact, deleteFact, simulateStoreChange, toggleFactApproval } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, DemoBadge, FactSourceBadge, fmtDate, KeyValue, Notice, PageHeader, Pill, RiskBadge } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";

const SOURCE_LABEL: Record<string, string> = {
  SHOPIFY_SYNC: "Shopify product data",
  SHOPIFY_METAFIELD: "Shopify metafield",
  MERCHANT_ENTERED: "Entered in PromiSure AI",
  AI_SUGGESTION: "AI suggestion (not evidence)",
};

export default async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const p = await prisma.product.findUnique({ where: { id }, include: { store: true, variants: true, facts: { orderBy: { createdAt: "asc" } }, campaigns: true } });
  if (!p) notFound();
  const tags = parseJson<string[]>(p.tagsJson, []);
  const cur = p.store.currency;

  return (
    <>
      <PageHeader eyebrow="Product Intelligence" title={p.title} subtitle={<span className="flex flex-wrap items-center gap-2"><span>/{p.handle}</span><DemoBadge show={p.isDemo} /></span>} actions={<Link href={`/campaigns/new`} className="btn btn-secondary">New campaign</Link>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Variants" subtitle="Price, inventory and selling policy as reported by Shopify" pad={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Variant</th><th>SKU</th><th>Price</th><th>Compare-at</th><th>Tracked</th><th>Quantity</th><th>When out of stock</th><th>Available</th>{p.store.isDemo && <th>Simulate store change</th>}</tr></thead>
                <tbody>
                  {p.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="min-w-32">{v.title}<div className="text-xs text-muted">{parseJson<{ name: string; value: string }[]>(v.optionsJson, []).map((o) => `${o.name}: ${o.value}`).join(" · ")}</div></td>
                      <td className="text-xs text-muted">{v.sku ?? "—"}</td>
                      <td className="tabular-nums">{formatMoney(v.price, cur)}</td>
                      <td className="tabular-nums text-muted">{formatMoney(v.compareAtPrice, cur)}</td>
                      <td>{v.inventoryTracked ? "Yes" : <Pill tone="review">No</Pill>}</td>
                      <td className="tabular-nums">{v.inventoryTracked ? (v.inventoryQuantity ?? "n/a") : "—"}</td>
                      <td className="text-xs">{v.inventoryPolicy === "CONTINUE" ? "Continue selling" : "Stop selling"}</td>
                      <td>{v.availableForSale ? <Pill tone="pass">Yes</Pill> : <Pill tone="block">No</Pill>}</td>
                      {p.store.isDemo && (
                        <td>
                          <form action={simulateStoreChange} className="flex items-center gap-1">
                            <input type="hidden" name="variantId" value={v.id} /><input type="hidden" name="productId" value={p.id} />
                            <label className="sr-only" htmlFor={`chg-${v.id}`}>Change</label>
                            <select id={`chg-${v.id}`} name="change" className="input py-1 text-xs">
                              <option value="SELL_OUT">Sell out</option><option value="RESTOCK">Restock</option><option value="PRICE_INCREASE">Raise price 10%</option><option value="ARCHIVE">Archive product</option><option value="ACTIVATE">Activate product</option>
                            </select>
                            <button className="btn btn-secondary btn-sm" title="Apply demo change and run monitoring"><FlaskConical size={13} /></button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.store.isDemo && <p className="border-t border-line px-5 py-2.5 text-[11px] text-muted">Simulated changes affect the demo store only, then run a monitoring cycle. PromiSure AI never modifies live Shopify prices or inventory.</p>}
          </Card>

          <Card title="Product facts" subtitle="Only approved Verified or Merchant-entered facts count as evidence. AI suggestions never do.">
            <div className="overflow-hidden rounded-lg border border-line">
              {p.facts.map((f) => (
                <div key={f.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><FactSourceBadge status={f.verificationStatus} /><Pill>{f.category}</Pill>{f.approved ? <Pill tone="teal">Approved evidence</Pill> : <Pill>Not approved</Pill>}</div>
                    <div className="mt-1.5 text-sm text-ink">{f.statement}</div>
                    <div className="mt-0.5 text-[11px] text-muted">Source: {SOURCE_LABEL[f.source] ?? f.source}{f.sourceRef ? ` · ${f.sourceRef}` : ""} · updated {fmtDate(f.updatedAt, true)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={toggleFactApproval}><input type="hidden" name="id" value={f.id} /><button className="btn btn-secondary btn-sm">{f.approved ? "Revoke" : f.source === "AI_SUGGESTION" ? "Verify & approve" : "Approve"}</button></form>
                    {(f.source !== "SHOPIFY_METAFIELD" || f.isDemo) && <form action={deleteFact}><input type="hidden" name="id" value={f.id} /><button className="btn btn-danger btn-sm">Remove</button></form>}
                  </div>
                </div>
              ))}
              {p.facts.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted">No facts yet. Add approved facts so claims can be verified.</div>}
            </div>
            <form action={addFact} className="mt-4 grid gap-3 rounded-lg bg-cloud p-4 md:grid-cols-[160px_1fr_auto]">
              <input type="hidden" name="productId" value={p.id} />
              <div><label className="label" htmlFor="category">Category</label><select id="category" name="category" className="input">{["MATERIAL", "DIMENSIONS", "COMPATIBILITY", "AGE", "SAFETY", "CERTIFICATION", "INCLUDED", "PERFORMANCE", "OTHER"].map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label className="label" htmlFor="statement">Fact statement</label><input id="statement" name="statement" required minLength={3} className="input" placeholder="e.g. Shell fabric rated 10,000 mm hydrostatic head" /></div>
              <div className="flex items-end gap-3"><label className="flex items-center gap-1.5 pb-2 text-xs"><input type="checkbox" name="approved" defaultChecked />Approve</label><button className="btn btn-primary">Add fact</button></div>
            </form>
            <p className="mt-2 text-[11px] text-muted">Tip: facts stored in Shopify metafields under the <code>promisure</code> namespace sync automatically as Verified facts.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            {p.imageUrl && <img src={p.imageUrl} alt={p.title} className="mb-4 aspect-square w-full rounded-lg object-cover ring-1 ring-line" />}
            <KeyValue items={[
              ["Status", <Pill key="s" tone={p.status === "ACTIVE" ? "pass" : "block"}>{p.status}</Pill>],
              ["Online Store", p.publishedOnOnlineStore ? "Published" : "Not published"],
              ["URL", p.onlineStoreUrl ? <span className="break-all text-xs">{p.onlineStoreUrl}</span> : "—"],
              ["Category", p.category ?? "—"],
              ["Type / vendor", `${p.productType ?? "—"} / ${p.vendor ?? "—"}`],
              ["Tags", tags.length ? tags.join(", ") : "—"],
              ["Shopify updated", fmtDate(p.shopifyUpdatedAt, true)],
              ["Last synchronised", fmtDate(p.syncedAt, true)],
              ["Shopify ID", <code key="id" className="text-[11px]">{p.shopifyId}</code>],
            ]} />
            {p.description && <p className="mt-4 text-sm text-muted">{p.description}</p>}
          </Card>
          <Card title="Associated campaigns" pad={false}>
            <ul className="divide-y divide-line">
              {p.campaigns.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><Link href={`/campaigns/${c.id}`} className="text-sm hover:text-teal-dark">{c.name}</Link><RiskBadge status={c.riskStatus} /></li>)}
              {p.campaigns.length === 0 && <li className="px-5 py-3 text-sm text-muted">No campaigns reference this product.</li>}
            </ul>
          </Card>
          {p.status !== "ACTIVE" && <Notice tone="danger">This product is {p.status.toLowerCase()}. Campaigns promoting it are blocked.</Notice>}
        </div>
      </div>
    </>
  );
}
