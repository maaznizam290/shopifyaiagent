import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { Flash, type SP } from "@/components/Flash";
import { Card, CHANNEL_LABELS, DemoBadge, EmptyState, fmtDate, PageHeader, Pill, RiskBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getActiveStore } from "@/lib/settings";

const FILTERS = ["ALL", "BLOCK", "REVIEW", "PASS", "UNCHECKED"];

export default async function CampaignsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filter = typeof sp.status === "string" && FILTERS.includes(sp.status) ? sp.status : "ALL";
  const store = await getActiveStore();
  const where = { storeId: store?.id ?? "", ...(filter === "ALL" ? {} : filter === "UNCHECKED" ? { riskStatus: null } : { riskStatus: filter }) };
  const campaigns = await prisma.campaign.findMany({ where, include: { product: true, variant: true, checks: { orderBy: { createdAt: "desc" }, take: 1, include: { findings: true } } }, orderBy: { updatedAt: "desc" } });

  return (
    <>
      <PageHeader
        eyebrow="Campaign Guardian"
        title="Campaigns"
        subtitle="Register campaigns before launch. Each one is verified against live Shopify prices, stock, product status, approved facts, shipping policies and landing pages."
        actions={<Link href="/campaigns/new" className="btn btn-primary"><Plus size={15} />New campaign</Link>}
      />
      <Flash searchParams={searchParams} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by risk status">
        {FILTERS.map((f) => (
          <Link key={f} href={f === "ALL" ? "/campaigns" : `/campaigns?status=${f}`} role="tab" aria-selected={filter === f} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${filter === f ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line hover:text-ink"}`}>
            {f === "ALL" ? "All" : f === "UNCHECKED" ? "Not checked" : f}
          </Link>
        ))}
      </div>
      <Card pad={false}>
        {campaigns.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No campaigns" body="Register your first campaign to verify it against live store facts." action={<Link href="/campaigns/new" className="btn btn-primary">New campaign</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Campaign</th><th>Channel</th><th>Product / variant</th><th>Workflow</th><th>Risk</th><th className="text-right">Score</th><th>Open issues</th><th>Last checked</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const f = c.checks[0]?.findings ?? [];
                  const blocks = f.filter((x) => x.outcome === "BLOCK").length;
                  const reviews = f.filter((x) => x.outcome === "REVIEW").length;
                  return (
                    <tr key={c.id}>
                      <td className="min-w-56">
                        <Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:text-teal-dark">{c.name}</Link>
                        <div className="mt-0.5 flex gap-1"><DemoBadge show={c.isDemo} /></div>
                      </td>
                      <td className="whitespace-nowrap text-muted">{CHANNEL_LABELS[c.channel]}</td>
                      <td className="min-w-48 text-muted">{c.product?.title ?? "—"}<div className="text-xs">{c.variant?.title}</div></td>
                      <td><Pill>{c.status}</Pill></td>
                      <td><RiskBadge status={c.riskStatus} /></td>
                      <td className="text-right font-semibold tabular-nums">{c.riskScore ?? "—"}</td>
                      <td className="whitespace-nowrap text-xs">
                        {blocks > 0 && <span className="mr-2 font-semibold text-block">{blocks} block</span>}
                        {reviews > 0 && <span className="font-semibold text-review">{reviews} review</span>}
                        {blocks + reviews === 0 && c.riskStatus && <span className="text-muted">None</span>}
                      </td>
                      <td className="whitespace-nowrap text-muted">{fmtDate(c.lastCheckedAt, true)}</td>
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
