import Link from "next/link";
import { Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { markNotificationsRead, runMonitoringNow } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, CHANNEL_LABELS, DemoBadge, EmptyState, fmtDate, PageHeader, RiskBadge, Stat } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import type { MonitorSummary } from "@/lib/monitoring/monitor";
import { getActiveStore, getSetting } from "@/lib/settings";

export default async function OverviewPage({ searchParams }: { searchParams: SP }) {
  const store = await getActiveStore();
  if (!store) return <EmptyState title="No store. Run npm run db:seed." />;
  const campaigns = await prisma.campaign.findMany({ where: { storeId: store.id }, include: { product: true }, orderBy: { updatedAt: "desc" } });
  const notifications = await prisma.notification.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 8 });
  const unread = notifications.some((n) => !n.read);
  const lastRun = parseJson<MonitorSummary | null>(await getSetting("monitor.lastRun"), null);
  const count = (s: string) => campaigns.filter((c) => c.riskStatus === s).length;
  const attention = campaigns.filter((c) => c.riskStatus === "BLOCK" || c.riskStatus === "REVIEW").sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Overview"
        badge={<DemoBadge show={store.isDemo} />}
        actions={
          <>
            <form action={runMonitoringNow}><button className="btn btn-secondary"><RefreshCw size={15} />Run monitoring</button></form>
            <Link href="/campaigns/new" className="btn btn-primary"><Plus size={15} />New campaign</Link>
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Campaigns" value={campaigns.length} tone="teal" href="/campaigns" />
        <Stat label="Pass" value={count("PASS")} tone="pass" href="/campaigns?status=PASS" />
        <Stat label="Review" value={count("REVIEW")} tone="review" href="/campaigns?status=REVIEW" />
        <Stat label="Block" value={count("BLOCK")} tone="block" href="/campaigns?status=BLOCK" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Needs attention" pad={false}>
          {attention.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="All clear" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th className="text-right">Risk</th><th>Checked</th></tr></thead>
                <tbody>
                  {attention.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:text-teal-dark">{c.name}</Link></td>
                      <td className="text-muted">{CHANNEL_LABELS[c.channel]}</td>
                      <td><RiskBadge status={c.riskStatus} /></td>
                      <td className="text-right font-semibold tabular-nums">{c.riskScore ?? "—"}</td>
                      <td className="whitespace-nowrap text-muted">{fmtDate(c.lastCheckedAt, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Alerts" pad={false} actions={unread && <form action={markNotificationsRead}><button className="link text-xs">Mark read</button></form>}>
          {notifications.length === 0 ? (
            <EmptyState title="No alerts" />
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
                <li key={n.id} className="flex items-start gap-2 px-5 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.level === "CRITICAL" ? "bg-block" : n.level === "WARNING" ? "bg-review" : "bg-pass"}`} aria-label={n.level} />
                  <div className="min-w-0">
                    <div className={`text-sm ${n.read ? "text-muted" : "font-medium text-ink"}`}>{n.campaignId ? <Link href={`/campaigns/${n.campaignId}`} className="hover:text-teal-dark">{n.title}</Link> : n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</div>
                    <div className="mt-1 text-[11px] text-steel">{fmtDate(n.createdAt, true)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {lastRun && (
        <Card className="mt-6" title="Last monitoring run">
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <div><dt className="label">When</dt><dd>{fmtDate(lastRun.startedAt, true)}</dd></div>
            <div><dt className="label">Product changes</dt><dd>{lastRun.changedProducts.length}</dd></div>
            <div><dt className="label">Re-checked</dt><dd>{lastRun.rechecked.length}</dd></div>
            <div><dt className="label">Status changes</dt><dd>{lastRun.statusChanges}</dd></div>
          </dl>
        </Card>
      )}
    </>
  );
}
