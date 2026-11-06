import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { Card, CHANNEL_LABELS, DemoBadge, EmptyState, fmtDate, PageHeader, RiskBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getActiveStore } from "@/lib/settings";

export default async function ReportsPage() {
  const store = await getActiveStore();
  // Latest report per campaign.
  const campaigns = await prisma.campaign.findMany({ where: { storeId: store?.id ?? "" }, include: { checks: { orderBy: { createdAt: "desc" }, take: 1, include: { findings: true } } }, orderBy: { lastCheckedAt: "desc" } });
  const withReports = campaigns.filter((c) => c.checks.length);
  return (
    <>
      <PageHeader eyebrow="Verification Reports" title="Verification reports" subtitle="Detailed, printable evidence reports for the latest verification of each campaign. Earlier runs are listed in Campaign History." />
      <Card pad={false}>
        {withReports.length === 0 ? <EmptyState icon={FileCheck2} title="No reports yet" body="Reports are created each time a campaign is verified." /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Campaign</th><th>Channel</th><th>Result</th><th className="text-right">Score</th><th className="text-right">Block</th><th className="text-right">Review</th><th className="text-right">Pass</th><th>Generated</th><th></th></tr></thead>
              <tbody>{withReports.map((c) => {
                const k = c.checks[0];
                const n = (o: string) => k.findings.filter((f) => f.outcome === o).length;
                return (
                  <tr key={c.id}>
                    <td><div className="font-medium">{c.name}</div><DemoBadge show={c.isDemo} /></td>
                    <td className="text-muted">{CHANNEL_LABELS[c.channel]}</td>
                    <td><RiskBadge status={k.riskStatus} /></td>
                    <td className="text-right tabular-nums">{k.riskScore}</td>
                    <td className="text-right tabular-nums text-block">{n("BLOCK")}</td>
                    <td className="text-right tabular-nums text-review">{n("REVIEW")}</td>
                    <td className="text-right tabular-nums text-pass">{n("PASS")}</td>
                    <td className="whitespace-nowrap text-muted">{fmtDate(k.createdAt, true)}</td>
                    <td><Link href={`/reports/${k.id}`} className="link text-xs">Open report</Link></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
