import Link from "next/link";
import { Boxes } from "lucide-react";
import { Flash, type SP } from "@/components/Flash";
import { Card, DemoBadge, EmptyState, fmtDate, PageHeader, Pill } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatMoney, toDecimal } from "@/lib/money";
import { getActiveStore } from "@/lib/settings";

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const store = await getActiveStore();
  const products = await prisma.product.findMany({
    where: { storeId: store?.id ?? "", ...(q ? { OR: [{ title: { contains: q } }, { handle: { contains: q } }] } : {}) },
    include: { variants: true, facts: true, _count: { select: { campaigns: true } } },
    orderBy: { title: "asc" },
  });
  return (
    <>
      <PageHeader eyebrow="Product Intelligence" title="Products" subtitle="Live product facts used as evidence for verification. Prices, stock and status come from Shopify. Claims come from approved facts only." />
      <Flash searchParams={searchParams} />
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search products</label>
        <input id="q" name="q" defaultValue={q} className="input" placeholder="Search by title or handle" />
        <button className="btn btn-secondary">Search</button>
      </form>
      <Card pad={false}>
        {products.length === 0 ? (
          <EmptyState icon={Boxes} title="No products" body={store?.isDemo ? "Reset the demo data in Settings." : "Synchronise your Shopify store from Shopify Connection."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Product</th><th>Status</th><th>Price</th><th>Variants</th><th>Availability</th><th>Inventory</th><th>Approved facts</th><th>Campaigns</th><th>Synced</th></tr></thead>
              <tbody>
                {products.map((p) => {
                  const prices = p.variants.map((v) => toDecimal(v.price)!).sort((a, b) => a.comparedTo(b));
                  const avail = p.variants.filter((v) => v.availableForSale).length;
                  const tracked = p.variants.filter((v) => v.inventoryTracked);
                  const qty = tracked.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0);
                  return (
                    <tr key={p.id}>
                      <td className="min-w-64">
                        <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-line" /> : <div className="h-10 w-10 rounded-md bg-cloud" />}
                          <div><div className="font-medium text-ink hover:text-teal-dark">{p.title}</div><div className="text-xs text-muted">/{p.handle} <DemoBadge show={p.isDemo} /></div></div>
                        </Link>
                      </td>
                      <td><Pill tone={p.status === "ACTIVE" ? (p.publishedOnOnlineStore ? "pass" : "review") : "block"}>{p.status}{p.status === "ACTIVE" && !p.publishedOnOnlineStore ? " · not on Online Store" : ""}</Pill></td>
                      <td className="whitespace-nowrap tabular-nums">{prices.length ? (prices[0].equals(prices[prices.length - 1]) ? formatMoney(prices[0], store?.currency) : `${formatMoney(prices[0], store?.currency)}–${formatMoney(prices[prices.length - 1], store?.currency)}`) : "—"}</td>
                      <td className="tabular-nums">{p.variants.length}</td>
                      <td className="whitespace-nowrap">{avail === p.variants.length ? <span className="text-pass">All available</span> : avail === 0 ? <span className="font-medium text-block">Unavailable</span> : <span className="text-review">{avail}/{p.variants.length} available</span>}</td>
                      <td className="whitespace-nowrap tabular-nums text-muted">{tracked.length === 0 ? "Not tracked" : `${qty} units`}</td>
                      <td className="tabular-nums">{p.facts.filter((f) => f.approved).length}</td>
                      <td className="tabular-nums">{p._count.campaigns}</td>
                      <td className="whitespace-nowrap text-xs text-muted">{fmtDate(p.syncedAt, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
