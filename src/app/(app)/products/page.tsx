import Link from "next/link";
import { Boxes } from "lucide-react";
import { Flash, type SP } from "@/components/Flash";
import { Card, DemoBadge, EmptyState, PageHeader, Pill } from "@/components/ui";
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
      <PageHeader
        title="Products"
        badge={<DemoBadge show={!!store?.isDemo} />}
        actions={
          <form role="search">
            <label htmlFor="q" className="sr-only">Search products</label>
            <input id="q" name="q" type="search" defaultValue={q} className="input w-64" placeholder="Search" />
          </form>
        }
      />
      <Flash searchParams={searchParams} />
      <Card pad={false}>
        {products.length === 0 ? (
          <EmptyState icon={Boxes} title="No products" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Product</th><th>Status</th><th>Price</th><th>Stock</th><th className="text-right">Facts</th><th className="text-right">Campaigns</th></tr></thead>
              <tbody>
                {products.map((p) => {
                  const prices = p.variants.map((v) => toDecimal(v.price)!).sort((a, b) => a.comparedTo(b));
                  const avail = p.variants.filter((v) => v.availableForSale).length;
                  const tracked = p.variants.filter((v) => v.inventoryTracked);
                  const qty = tracked.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0);
                  const live = p.status === "ACTIVE" && p.publishedOnOnlineStore;
                  return (
                    <tr key={p.id}>
                      <td className="min-w-64">
                        <Link href={`/products/${p.id}`} className="flex items-center gap-3 font-medium text-ink hover:text-teal-dark">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover ring-1 ring-line" /> : <span className="h-9 w-9 rounded-md bg-cloud" />}
                          {p.title}
                        </Link>
                      </td>
                      <td><Pill tone={live ? "pass" : p.status === "ACTIVE" ? "review" : "block"}>{p.status === "ACTIVE" && !p.publishedOnOnlineStore ? "Unpublished" : p.status.charAt(0) + p.status.slice(1).toLowerCase()}</Pill></td>
                      <td className="whitespace-nowrap tabular-nums">{prices.length ? (prices[0].equals(prices[prices.length - 1]) ? formatMoney(prices[0], store?.currency) : `${formatMoney(prices[0], store?.currency)}–${formatMoney(prices[prices.length - 1], store?.currency)}`) : "—"}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {avail === 0 ? <span className="font-medium text-block">Unavailable</span> : tracked.length === 0 ? <span className="text-muted">Untracked</span> : <span className={avail < p.variants.length ? "text-review" : ""}>{qty}</span>}
                      </td>
                      <td className="text-right tabular-nums">{p.facts.filter((f) => f.approved).length}</td>
                      <td className="text-right tabular-nums">{p._count.campaigns}</td>
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
