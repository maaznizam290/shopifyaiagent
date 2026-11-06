import Link from "next/link";
import { BarList } from "@/components/BarList";
import { Card, DemoBadge, PageHeader, Pill, Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import { QUALIFIED_THRESHOLD, TARGET_ROLES } from "@/lib/sales/scoring";

const SEGMENTS: Record<string, string> = { AGENCY_MARKETING: "Shopify marketing agencies", AGENCY_DEV: "Shopify development agencies", DTC_BRAND: "DTC brands", RETAILER: "Retailers / multi-channel", OTHER: "Other" };

export default async function SalesPage() {
  const prospects = await prisma.prospect.findMany({ orderBy: { leadScore: "desc" } });
  const qualified = prospects.filter((p) => p.leadScore >= QUALIFIED_THRESHOLD);
  const au = prospects.filter((p) => /australia/i.test(p.country));
  const verified = prospects.filter((p) => p.shopifyVerified);
  const bySegment = Object.entries(SEGMENTS).map(([k, label]) => ({ label, value: prospects.filter((p) => (p.businessType ?? "OTHER") === k).length }));
  const byCity = Object.entries(prospects.reduce<Record<string, number>>((a, p) => { const c = (p.location ?? "Unknown").split(",")[0].trim(); a[c] = (a[c] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const anyDemo = prospects.some((p) => p.isDemo);

  return (
    <>
      <PageHeader eyebrow="Sales Intelligence" title="Sales intelligence" subtitle={<>Finding prospective PromiSure AI customers, starting with Australian Shopify merchants and agencies. {anyDemo && <DemoBadge />}</>} actions={<Link href="/prospects" className="btn btn-primary">Open CRM</Link>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Prospects" value={prospects.length} tone="teal" href="/prospects" />
        <Stat label="Qualified" value={qualified.length} hint={`Score ≥ ${QUALIFIED_THRESHOLD}`} tone="pass" href="/prospects?qualified=1" />
        <Stat label="In Australia" value={au.length} hint="Initial market" tone="brass" />
        <Stat label="Shopify verified" value={verified.length} hint="Evidence confirmed by you" tone="teal" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Ideal customer profile">
          <div className="space-y-3 text-sm">
            <div><div className="label">Segments</div><div className="flex flex-wrap gap-1.5">{Object.values(SEGMENTS).slice(0, 4).map((s) => <Pill key={s}>{s}</Pill>)}</div></div>
            <div><div className="label">Verticals</div><div className="flex flex-wrap gap-1.5">{["Fashion", "Beauty", "Homewares", "Toys", "Pet", "Outdoor"].map((s) => <Pill key={s}>{s}</Pill>)}</div></div>
            <div><div className="label">Roles</div><div className="flex flex-wrap gap-1.5">{TARGET_ROLES.map((s) => <Pill key={s}>{s}</Pill>)}</div></div>
            <div><div className="label">Signals that score</div><p className="text-xs text-muted">Business type, target industry, Australian location, verified Shopify usage, decision-maker role, recorded contact route and website, documented hypothesis. Unknowns score zero.</p></div>
          </div>
        </Card>
        <Card title="Prospects by segment"><BarList rows={bySegment} /></Card>
        <Card title="Prospects by location"><BarList rows={byCity} tone="bg-brass" /></Card>
      </div>
      <Card className="mt-6" title="Top qualified prospects" pad={false} actions={<Link href="/outreach" className="link text-xs">Draft outreach →</Link>}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Company</th><th>Segment</th><th>Contact</th><th>Shopify</th><th className="text-right">Score</th><th>Status</th></tr></thead>
            <tbody>{qualified.slice(0, 8).map((p) => (
              <tr key={p.id}>
                <td><Link href={`/prospects/${p.id}`} className="font-medium hover:text-teal-dark">{p.companyName}</Link></td>
                <td className="text-muted">{SEGMENTS[p.businessType ?? "OTHER"]}</td>
                <td>{p.contactName}<div className="text-xs text-muted">{p.jobTitle}</div></td>
                <td>{p.shopifyVerified ? <Pill tone="pass">Verified</Pill> : <Pill>Unverified</Pill>}</td>
                <td className="text-right font-semibold tabular-nums text-teal-dark">{p.leadScore}</td>
                <td><Pill>{p.outreachStatus}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
