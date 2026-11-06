import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { Flash, type SP } from "@/components/Flash";
import { Card, CHANNEL_LABELS, DemoBadge, EmptyState, fmtDate, PageHeader, RiskBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getActiveStore } from "@/lib/settings";

const FILTERS = [["ALL", "All"], ["BLOCK", "Block"], ["REVIEW", "Review"], ["PASS", "Pass"], ["UNCHECKED", "Unchecked"]];

export default async function CampaignsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filter = typeof sp.status === "string" && FILTERS.some(([k]) => k === sp.status) ? sp.status : "ALL";
  const store = await getActiveStore();
  const where = { storeId: store?.id ?? "", ...(filter === "ALL" ? {} : filter === "UNCHECKED" ? { riskStatus: null } : { riskStatus: filter }) };
  const campaigns = await prisma.campaign.findMany({ where, include: { product: true, checks: { orderBy: { createdAt: "desc" }, take: 1, include: { findings: true } } }, orderBy: { updatedAt: "desc" } });
  const newButton = <Link href="/campaigns/new" className="btn btn-primary"><Plus size={15} />New campaign</Link>;

  return (
    <>
      <PageHeader title="Campaigns" badge={<DemoBadge show={!!store?.isDemo} />} actions={newButton} />
      <Flash searchParams={searchParams} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by risk status">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k === "ALL" ? "/campaigns" : `/campaigns?status=${k}`} aria-current={filter === k ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${filter === k ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <Card pad={false}>
        {campaigns.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No campaigns" action={filter === "ALL" ? newButton : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Campaign</th><th>Channel</th><th>Product</th><th>Stage</th><th>Risk</th><th className="text-right">Score</th><th>Issues</th><th>Checked</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const f = c.checks[0]?.findings ?? [];
                  const blocks = f.filter((x) => x.outcome === "BLOCK").length;
                  const reviews = f.filter((x) => x.outcome === "REVIEW").length;
                  return (
                    <tr key={c.id}>
                      <td className="min-w-56"><Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:text-teal-dark">{c.name}</Link></td>
                      <td className="whitespace-nowrap text-muted">{CHANNEL_LABELS[c.channel]}</td>
                      <td className="min-w-48 text-muted">{c.product?.title ?? "—"}</td>
                      <td className="text-xs text-muted">{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</td>
                      <td><RiskBadge status={c.riskStatus} /></td>
                      <td className="text-right font-semibold tabular-nums">{c.riskScore ?? "—"}</td>
                      <td className="whitespace-nowrap text-xs">
                        {blocks > 0 && <span className="mr-2 font-semibold text-block">{blocks} block</span>}
                        {reviews > 0 && <span className="font-semibold text-review">{reviews} review</span>}
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
