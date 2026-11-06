import { BarList } from "@/components/BarList";
import { Card, DemoBadge, Notice, PageHeader, Stat } from "@/components/ui";
import { campaignAnalytics, salesAnalytics } from "@/lib/analytics";
import { getActiveStore } from "@/lib/settings";

export default async function AnalyticsPage() {
  const store = await getActiveStore();
  const ca = await campaignAnalytics(store?.id ?? "");
  const sa = await salesAnalytics();
  const funnel = (s: typeof sa.actual) => [
    { label: "Total prospects", value: s.total },
    { label: "Qualified prospects", value: s.qualified },
    { label: "Outreach drafts created", value: s.drafts },
    { label: "Messages sent manually (recorded)", value: s.messages },
    { label: "Replies", value: s.replies },
    { label: "Meetings", value: s.meetings },
    { label: "Pilot offers", value: s.pilots },
    { label: "Paying customers", value: s.customers },
  ];
  return (
    <>
      <PageHeader eyebrow="Analytics" title="Analytics" subtitle="Counts of verification outcomes and sales activity. PromiSure AI does not estimate prevented revenue loss, because it has no evidence of what would have happened." />
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">Campaign analytics <DemoBadge show={ca.isDemo} /></h2>
      {ca.isDemo && <div className="mb-4"><Notice>These figures come from the demo store&apos;s deliberately inconsistent campaigns. They do not represent real merchant performance.</Notice></div>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Campaigns checked" value={ca.checked} hint={`${ca.totalChecks} verification runs`} tone="teal" />
        <Stat label="Pass" value={ca.pass} tone="pass" />
        <Stat label="Review" value={ca.review} tone="review" />
        <Stat label="Block" value={ca.block} tone="block" />
        <Stat label="Pass rate" value={ca.checked ? `${Math.round((ca.pass / ca.checked) * 100)}%` : "—"} tone="brass" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Campaigns with open discrepancies" subtitle="Latest verification of each campaign">
          <BarList tone="bg-block/80" max={Math.max(1, ca.checked)} rows={[
            { label: "Price discrepancies", value: ca.discrepancies.price },
            { label: "Inventory discrepancies", value: ca.discrepancies.inventory },
            { label: "Claim discrepancies", value: ca.discrepancies.claims },
            { label: "Expired offers", value: ca.discrepancies.expired },
            { label: "Broken or mismatched links", value: ca.discrepancies.brokenLinks },
            { label: "Shipping promise issues", value: ca.discrepancies.shipping },
          ]} />
        </Card>
        <Card title="Open findings by check" subtitle="Non-passing findings across latest verifications">
          <BarList rows={ca.findingsByType.map(([label, value]) => ({ label: label.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), value }))} />
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">Sales analytics</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Actual performance" subtitle="Your manually entered and recorded activity only">
          {sa.actual.total === 0 ? <p className="text-sm text-muted">No real prospects recorded yet.</p> : <BarList rows={funnel(sa.actual)} max={Math.max(1, sa.actual.total)} />}
        </Card>
        <Card title={<span className="flex items-center gap-2">Demonstration data <DemoBadge /></span>} subtitle="Fictional prospects included for demonstration">
          <BarList tone="bg-brass" rows={funnel(sa.demo)} max={Math.max(1, sa.demo.total)} />
        </Card>
      </div>
    </>
  );
}
