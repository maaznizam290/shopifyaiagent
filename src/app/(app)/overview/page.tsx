import Link from "next/link";
import { Activity, Bell, RefreshCw, ShieldCheck } from "lucide-react";
import { markNotificationsRead, runMonitoringNow } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, CHANNEL_LABELS, DemoBadge, EmptyState, fmtDate, Notice, PageHeader, Pill, RiskBadge, Stat } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import type { MonitorSummary } from "@/lib/monitoring/monitor";
import { getActiveStore, getSetting } from "@/lib/settings";

export default async function OverviewPage({ searchParams }: { searchParams: SP }) {
  const store = await getActiveStore();
  if (!store) return <EmptyState title="No store configured" body="Run npm run db:seed to load demo data." />;
  const campaigns = await prisma.campaign.findMany({ where: { storeId: store.id }, include: { product: true }, orderBy: { updatedAt: "desc" } });
  const notifications = await prisma.notification.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 8 });
  const unread = notifications.filter((n) => !n.read).length;
  const lastRun = parseJson<MonitorSummary | null>(await getSetting("monitor.lastRun"), null);
  const count = (s: string) => campaigns.filter((c) => c.riskStatus === s).length;
  const attention = campaigns.filter((c) => c.riskStatus === "BLOCK" || c.riskStatus === "REVIEW").sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 6);
  const live = campaigns.filter((c) => ["LIVE", "APPROVED"].includes(c.status));
  const liveBlocked = live.filter((c) => c.riskStatus === "BLOCK").length;
  const interval = Number(process.env.MONITOR_INTERVAL_MINUTES ?? 15);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Campaign integrity at a glance"
        subtitle={<>Every registered campaign checked against live facts from <span className="font-medium text-ink">{store.name}</span>. {store.isDemo && <DemoBadge />}</>}
        actions={
          <>
            <form action={runMonitoringNow}><button className="btn btn-secondary"><RefreshCw size={15} />Run monitoring now</button></form>
            <Link href="/campaigns/new" className="btn btn-primary"><ShieldCheck size={15} />Verify a campaign</Link>
          </>
        }
      />
      <Flash searchParams={searchParams} />
      {store.isDemo && <div className="mb-5"><Notice title="Demo mode">You are viewing a fictional store with deliberately inconsistent campaigns. All figures on this page come from DEMO DATA, not real merchant performance.</Notice></div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Campaigns registered" value={campaigns.length} hint={`${live.length} approved or live`} tone="teal" href="/campaigns" />
        <Stat label="Pass" value={count("PASS")} hint="All mandatory checks passed" tone="pass" href="/campaigns?status=PASS" />
        <Stat label="Review" value={count("REVIEW")} hint="Needs human verification" tone="review" href="/campaigns?status=REVIEW" />
        <Stat label="Block" value={count("BLOCK")} hint={liveBlocked ? `${liveBlocked} of these are approved or live` : "Confirmed critical mismatches"} tone="block" href="/campaigns?status=BLOCK" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Needs attention" subtitle="Highest risk first" pad={false} actions={<Link href="/campaigns" className="link text-xs">All campaigns →</Link>}>
          {attention.length === 0 ? (
            <EmptyState title="Nothing needs attention" body="All campaigns passed verification." icon={ShieldCheck} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th className="text-right">Risk</th><th>Checked</th></tr></thead>
                <tbody>
                  {attention.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:text-teal-dark">{c.name}</Link><div className="text-xs text-muted">{c.product?.title ?? "No product linked"}</div></td>
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

        <Card title={<span className="flex items-center gap-2"><Bell size={15} />Notifications {unread > 0 && <Pill tone="block">{unread} new</Pill>}</span>} pad={false} actions={unread > 0 && <form action={markNotificationsRead}><button className="link text-xs">Mark all read</button></form>}>
          {notifications.length === 0 ? (
            <EmptyState title="No notifications" body="Monitoring alerts appear here when a store change affects a campaign." />
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.level === "CRITICAL" ? "bg-block" : n.level === "WARNING" ? "bg-review" : "bg-pass"}`} />
                    <div className="min-w-0">
                      <div className={`text-sm ${n.read ? "text-muted" : "font-medium text-ink"}`}>{n.campaignId ? <Link href={`/campaigns/${n.campaignId}`} className="hover:text-teal-dark">{n.title}</Link> : n.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</div>
                      <div className="mt-1 text-[11px] text-steel">{fmtDate(n.createdAt, true)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card title={<span className="flex items-center gap-2"><Activity size={15} />Monitoring</span>} subtitle={interval > 0 ? `Scheduled polling every ${interval} minutes while the server runs. Shopify webhooks trigger immediate re-checks when configured.` : "Scheduled polling disabled (MONITOR_INTERVAL_MINUTES=0)."}>
          {lastRun ? (
            <div className="grid gap-4 text-sm sm:grid-cols-4">
              <div><div className="label">Last cycle</div>{fmtDate(lastRun.startedAt, true)}</div>
              <div><div className="label">Product changes</div>{lastRun.changedProducts.length}</div>
              <div><div className="label">Campaigns re-checked</div>{lastRun.rechecked.length}</div>
              <div><div className="label">Status changes</div>{lastRun.statusChanges}</div>
            </div>
          ) : (
            <p className="text-sm text-muted">No monitoring cycle has run yet.</p>
          )}
          <p className="mt-4 text-xs text-muted">PromiSure AI monitors campaigns registered here. It does not see every ad or social post that may exist elsewhere.</p>
        </Card>
      </div>
    </>
  );
}
