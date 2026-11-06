import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical, Plus } from "lucide-react";
import { addFact, deleteFact, simulateStoreChange, toggleFactApproval } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, DemoBadge, FactSourceBadge, fmtDate, KeyValue, PageHeader, Pill, RiskBadge } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";

const FACT_CATEGORIES = ["MATERIAL", "DIMENSIONS", "COMPATIBILITY", "AGE", "SAFETY", "CERTIFICATION", "INCLUDED", "PERFORMANCE", "OTHER"];
const DEMO_CHANGES = [["SELL_OUT", "Sell out"], ["RESTOCK", "Restock"], ["PRICE_INCREASE", "Raise price 10%"], ["ARCHIVE", "Archive"], ["ACTIVATE", "Activate"]];

export default async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const p = await prisma.product.findUnique({ where: { id }, include: { store: true, variants: true, facts: { orderBy: { createdAt: "asc" } }, campaigns: true } });
  if (!p) notFound();
  const tags = parseJson<string[]>(p.tagsJson, []);
  const cur = p.store.currency;
  const demo = p.store.isDemo;

  return (
    <>
      <PageHeader title={p.title} badge={<DemoBadge show={p.isDemo} />} actions={<Link href="/campaigns/new" className="btn btn-secondary"><Plus size={15} />New campaign</Link>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Variants" pad={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Variant</th><th>SKU</th><th>Price</th><th>Compare-at</th><th>Stock</th><th>Available</th>{demo && <th>Simulate</th>}</tr></thead>
                <tbody>
                  {p.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="min-w-32">{v.title}</td>
                      <td className="text-xs text-muted">{v.sku ?? "—"}</td>
                      <td className="tabular-nums">{formatMoney(v.price, cur)}</td>
                      <td className="tabular-nums text-muted">{formatMoney(v.compareAtPrice, cur)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {v.inventoryTracked ? (v.inventoryQuantity ?? "—") : <span className="text-muted">Untracked</span>}
                        {v.inventoryPolicy === "CONTINUE" && <span className="ml-2"><Pill tone="review">Backorder</Pill></span>}
                      </td>
                      <td>{v.availableForSale ? <Pill tone="pass">Yes</Pill> : <Pill tone="block">No</Pill>}</td>
                      {demo && (
                        <td>
                          <form action={simulateStoreChange} className="flex items-center gap-1">
                            <input type="hidden" name="variantId" value={v.id} /><input type="hidden" name="productId" value={p.id} />
                            <label className="sr-only" htmlFor={`chg-${v.id}`}>Change</label>
                            <select id={`chg-${v.id}`} name="change" className="input py-1 text-xs">{DEMO_CHANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                            <button className="btn btn-secondary btn-sm" title="Apply demo change and run monitoring"><FlaskConical size={13} /></button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Facts" pad={false}>
            <ul className="divide-y divide-line">
              {p.facts.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className={`text-sm ${f.approved ? "text-ink" : "text-muted"}`}>{f.statement}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><FactSourceBadge status={f.verificationStatus} /><Pill>{f.category.charAt(0) + f.category.slice(1).toLowerCase()}</Pill>{!f.approved && <Pill tone="review">Not approved</Pill>}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={toggleFactApproval}><input type="hidden" name="id" value={f.id} /><button className="btn btn-secondary btn-sm">{f.approved ? "Revoke" : "Approve"}</button></form>
                    {(f.source !== "SHOPIFY_METAFIELD" || f.isDemo) && <form action={deleteFact}><input type="hidden" name="id" value={f.id} /><button className="btn btn-danger btn-sm">Remove</button></form>}
                  </div>
                </li>
              ))}
            </ul>
            <form action={addFact} className="grid gap-2 border-t border-line bg-cloud/60 p-4 sm:grid-cols-[150px_1fr_auto_auto] sm:items-center">
              <input type="hidden" name="productId" value={p.id} />
              <label className="sr-only" htmlFor="category">Category</label>
              <select id="category" name="category" className="input">{FACT_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}</select>
              <label className="sr-only" htmlFor="statement">Fact</label>
              <input id="statement" name="statement" required minLength={3} className="input" placeholder="New fact" />
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="approved" defaultChecked />Approved</label>
              <button className="btn btn-primary">Add</button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            {p.imageUrl && <img src={p.imageUrl} alt={p.title} className="mb-4 aspect-square w-full rounded-lg object-cover ring-1 ring-line" />}
            <KeyValue items={[
              ["Status", p.status === "ACTIVE" && !p.publishedOnOnlineStore ? "Unpublished" : p.status.charAt(0) + p.status.slice(1).toLowerCase()],
              ["Vendor", p.vendor ?? "—"],
              ["Category", p.category ?? "—"],
              ["Tags", tags.length ? tags.join(", ") : "—"],
              ["Synced", fmtDate(p.syncedAt, true)],
              ["URL", p.onlineStoreUrl ? <span className="break-all text-xs">{p.onlineStoreUrl}</span> : "—"],
            ]} />
            {p.description && <p className="mt-4 text-sm text-muted">{p.description}</p>}
          </Card>
          {p.campaigns.length > 0 && (
            <Card title="Campaigns" pad={false}>
              <ul className="divide-y divide-line">
                {p.campaigns.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><Link href={`/campaigns/${c.id}`} className="text-sm hover:text-teal-dark">{c.name}</Link><RiskBadge status={c.riskStatus} /></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
