import { BarList } from "@/components/BarList";
import { Card, DemoBadge, PageHeader, Stat } from "@/components/ui";
import { campaignAnalytics, salesAnalytics } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { getActiveStore } from "@/lib/settings";

const SEGMENTS: Record<string, string> = { AGENCY_MARKETING: "Marketing agencies", AGENCY_DEV: "Development agencies", DTC_BRAND: "DTC brands", RETAILER: "Retailers", OTHER: "Other" };

/** Counts only. No revenue estimates: there is no evidence of what would have happened otherwise. */
export default async function AnalyticsPage() {
  const store = await getActiveStore();
  const ca = await campaignAnalytics(store?.id ?? "");
  const sa = await salesAnalytics();
  const prospects = await prisma.prospect.findMany({ select: { businessType: true, location: true } });
  const bySegment = Object.entries(SEGMENTS).map(([k, label]) => ({ label, value: prospects.filter((p) => (p.businessType ?? "OTHER") === k).length }));
  const byLocation = Object.entries(prospects.reduce<Record<string, number>>((a, p) => { const c = (p.location ?? "Unknown").split(",")[0].trim(); a[c] = (a[c] ?? 0) + 1; return a; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const funnel = (s: typeof sa.actual) => [
    { label: "Prospects", value: s.total },
    { label: "Qualified", value: s.qualified },
    { label: "Drafts", value: s.drafts },
    { label: "Messages sent", value: s.messages },
    { label: "Replies", value: s.replies },
    { label: "Meetings", value: s.meetings },
    { label: "Pilots", value: s.pilots },
    { label: "Customers", value: s.customers },
  ];

  return (
    <>
      <PageHeader title="Analytics" badge={<DemoBadge show={ca.isDemo} />} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Checked" value={ca.checked} tone="teal" />
        <Stat label="Pass" value={ca.pass} tone="pass" />
        <Stat label="Review" value={ca.review} tone="review" />
        <Stat label="Block" value={ca.block} tone="block" />
        <Stat label="Pass rate" value={ca.checked ? `${Math.round((ca.pass / ca.checked) * 100)}%` : "—"} tone="brass" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Open issues by type">
          <BarList tone="bg-block/80" max={Math.max(1, ca.checked)} rows={[
            { label: "Price", value: ca.discrepancies.price },
            { label: "Inventory", value: ca.discrepancies.inventory },
            { label: "Claims", value: ca.discrepancies.claims },
            { label: "Expired offers", value: ca.discrepancies.expired },
            { label: "Links", value: ca.discrepancies.brokenLinks },
            { label: "Shipping", value: ca.discrepancies.shipping },
          ]} />
        </Card>
        <Card title="Open findings by check">
          <BarList rows={ca.findingsByType.map(([label, value]) => ({ label: label.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), value }))} />
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-ink">Sales</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pipeline">
          {sa.actual.total === 0 ? <p className="text-sm text-muted">No prospects yet</p> : <BarList rows={funnel(sa.actual)} max={Math.max(1, sa.actual.total)} />}
        </Card>
        <Card title={<span className="flex items-center gap-2">Demo pipeline <DemoBadge /></span>}>
          <BarList tone="bg-brass" rows={funnel(sa.demo)} max={Math.max(1, sa.demo.total)} />
        </Card>
        <Card title="Prospects by segment"><BarList rows={bySegment} /></Card>
        <Card title="Prospects by location"><BarList rows={byLocation} tone="bg-brass" /></Card>
      </div>
    </>
  );
}
