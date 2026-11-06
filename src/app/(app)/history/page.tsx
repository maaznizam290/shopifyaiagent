import Link from "next/link";
import { Flash, type SP } from "@/components/Flash";
import { Card, EmptyState, fmtDate, PageHeader, RiskBadge } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { getActiveStore } from "@/lib/settings";

const TABS = [["runs", "Runs"], ["audit", "Audit log"]] as const;

export default async function HistoryPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = sp.tab === "audit" ? "audit" : "runs";
  const store = await getActiveStore();
  const checks = tab === "runs" ? await prisma.campaignCheck.findMany({ where: { campaign: { storeId: store?.id ?? "" } }, include: { campaign: true }, orderBy: { createdAt: "desc" }, take: 200 }) : [];
  const logs = tab === "audit" ? await prisma.auditLog.findMany({ where: { OR: [{ storeId: store?.id }, { storeId: null }] }, orderBy: { createdAt: "desc" }, take: 300 }) : [];
  return (
    <>
      <PageHeader title="History" />
      <Flash searchParams={searchParams} />
      <nav className="mb-4 flex gap-2" aria-label="History view">
        {TABS.map(([k, label]) => (
          <Link key={k} href={k === "runs" ? "/history" : "/history?tab=audit"} aria-current={tab === k ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tab === k ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      <Card pad={false}>
        {tab === "runs" ? (
          checks.length === 0 ? <EmptyState title="No runs yet" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>When</th><th>Campaign</th><th>Trigger</th><th>Result</th><th className="text-right">Score</th><th>Summary</th><th></th></tr></thead>
                <tbody>{checks.map((k) => (
                  <tr key={k.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(k.createdAt, true)}</td>
                    <td><Link href={`/campaigns/${k.campaignId}`} className="font-medium hover:text-teal-dark">{k.campaign.name}</Link></td>
                    <td className="text-xs text-muted">{k.trigger.charAt(0) + k.trigger.slice(1).toLowerCase()}</td>
                    <td><RiskBadge status={k.riskStatus} /></td>
                    <td className="text-right tabular-nums">{k.riskScore}</td>
                    <td className="min-w-64 text-muted">{k.summary}</td>
                    <td><Link href={`/reports/${k.id}`} className="link text-xs">Report</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
        ) : logs.length === 0 ? <EmptyState title="No entries" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>{logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-muted">{fmtDate(l.createdAt, true)}</td>
                  <td className="text-xs">{l.actor}</td>
                  <td><code className="text-xs">{l.action}</code></td>
                  <td className="max-w-md truncate text-xs text-muted" title={l.detailJson}>{Object.entries(parseJson<Record<string, unknown>>(l.detailJson, {})).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
