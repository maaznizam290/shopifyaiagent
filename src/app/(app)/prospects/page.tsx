import Link from "next/link";
import { Upload, Users } from "lucide-react";
import { importProspectsCsv } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { ProspectFields } from "@/components/ProspectFields";
import { Card, DemoBadge, EmptyState, PageHeader, Pill } from "@/components/ui";
import { saveProspect } from "@/app/actions";
import { prisma } from "@/lib/db";
import { OUTREACH_STATUSES, QUALIFIED_THRESHOLD } from "@/lib/sales/scoring";

export default async function ProspectsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (OUTREACH_STATUSES as readonly string[]).includes(sp.status) ? sp.status : null;
  const qualifiedOnly = sp.qualified === "1";
  const prospects = await prisma.prospect.findMany({
    where: { ...(status ? { outreachStatus: status } : {}), ...(qualifiedOnly ? { leadScore: { gte: QUALIFIED_THRESHOLD } } : {}) },
    orderBy: [{ leadScore: "desc" }, { updatedAt: "desc" }],
  });
  return (
    <>
      <PageHeader eyebrow="Prospect CRM" title="Prospects" subtitle="Prospective PromiSure AI customers, scored only on information you have recorded and verified." />
      <Flash searchParams={searchParams} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/prospects" className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${!status && !qualifiedOnly ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line"}`}>All</Link>
        <Link href="/prospects?qualified=1" className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${qualifiedOnly ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line"}`}>Qualified (≥{QUALIFIED_THRESHOLD})</Link>
        {OUTREACH_STATUSES.map((s) => <Link key={s} href={`/prospects?status=${s}`} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status === s ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line"}`}>{s}</Link>)}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" pad={false}>
          {prospects.length === 0 ? <EmptyState icon={Users} title="No prospects" body="Add a prospect manually or import a CSV." /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Company</th><th>Contact</th><th>Location</th><th>Shopify</th><th className="text-right">Score</th><th>Status</th></tr></thead>
                <tbody>{prospects.map((p) => (
                  <tr key={p.id}>
                    <td className="min-w-48"><Link href={`/prospects/${p.id}`} className="font-medium hover:text-teal-dark">{p.companyName}</Link><div className="flex gap-1 text-xs text-muted">{p.industry} <DemoBadge show={p.isDemo} /></div></td>
                    <td className="min-w-40">{p.contactName ?? "—"}<div className="text-xs text-muted">{p.jobTitle}</div></td>
                    <td className="text-muted">{p.location ?? "—"}</td>
                    <td>{p.shopifyVerified ? <Pill tone="pass">Verified</Pill> : p.shopifyEvidence ? <Pill tone="review">Unverified</Pill> : <Pill>Unknown</Pill>}</td>
                    <td className="text-right"><span className={`font-semibold tabular-nums ${p.leadScore >= QUALIFIED_THRESHOLD ? "text-teal-dark" : "text-muted"}`}>{p.leadScore}</span></td>
                    <td><Pill>{p.outreachStatus}</Pill></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Add prospect">
            <form action={saveProspect} className="space-y-3"><ProspectFields /><button className="btn btn-primary w-full">Add prospect</button></form>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Upload size={15} />Import CSV</span>}>
            <form action={importProspectsCsv} className="space-y-3">
              <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white" />
              <p className="text-[11px] text-muted">Headers: Company, Contact Name, Job Title, Website, LinkedIn URL, Email, Location, Country, Industry, Business Type, Shopify Evidence, Shopify Verified, Employees, Problem Hypothesis, Notes.</p>
              <button className="btn btn-secondary w-full">Import</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
