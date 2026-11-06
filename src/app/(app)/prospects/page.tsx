import Link from "next/link";
import { Upload, Users } from "lucide-react";
import { importProspectsCsv, saveProspect } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { ProspectFields } from "@/components/ProspectFields";
import { Card, DemoBadge, EmptyState, PageHeader, Pill } from "@/components/ui";
import { prisma } from "@/lib/db";
import { OUTREACH_STATUSES, QUALIFIED_THRESHOLD } from "@/lib/sales/scoring";

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default async function ProspectsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (OUTREACH_STATUSES as readonly string[]).includes(sp.status) ? sp.status : null;
  const qualifiedOnly = sp.qualified === "1";
  const prospects = await prisma.prospect.findMany({
    where: { ...(status ? { outreachStatus: status } : {}), ...(qualifiedOnly ? { leadScore: { gte: QUALIFIED_THRESHOLD } } : {}) },
    orderBy: [{ leadScore: "desc" }, { updatedAt: "desc" }],
  });
  const filters: [string, string, boolean][] = [
    ["/prospects", "All", !status && !qualifiedOnly],
    ["/prospects?qualified=1", "Qualified", qualifiedOnly],
    ...OUTREACH_STATUSES.map((s): [string, string, boolean] => [`/prospects?status=${s}`, label(s), status === s]),
  ];
  return (
    <>
      <PageHeader title="Prospects" badge={<DemoBadge show={prospects.some((p) => p.isDemo)} />} />
      <Flash searchParams={searchParams} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter prospects">
        {filters.map(([href, text, on]) => <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${on ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line hover:text-ink"}`}>{text}</Link>)}
      </nav>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" pad={false}>
          {prospects.length === 0 ? <EmptyState icon={Users} title="No prospects" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Company</th><th>Contact</th><th>Location</th><th>Shopify</th><th className="text-right">Score</th><th>Status</th></tr></thead>
                <tbody>{prospects.map((p) => (
                  <tr key={p.id}>
                    <td className="min-w-48"><Link href={`/prospects/${p.id}`} className="font-medium hover:text-teal-dark">{p.companyName}</Link></td>
                    <td className="min-w-40">{p.contactName ?? "—"}<div className="text-xs text-muted">{p.jobTitle}</div></td>
                    <td className="text-muted">{p.location ?? "—"}</td>
                    <td>{p.shopifyVerified ? <Pill tone="pass">Verified</Pill> : p.shopifyEvidence ? <Pill tone="review">Unverified</Pill> : <span className="text-muted">—</span>}</td>
                    <td className={`text-right font-semibold tabular-nums ${p.leadScore >= QUALIFIED_THRESHOLD ? "text-teal-dark" : "text-muted"}`}>{p.leadScore}</td>
                    <td className="text-xs text-muted">{label(p.outreachStatus)}</td>
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
          <Card title="Import" actions={<a href="/prospects-template.csv" download className="link text-xs">Template</a>}>
            <form action={importProspectsCsv} className="flex items-center gap-2">
              <label className="sr-only" htmlFor="csv">CSV file</label>
              <input id="csv" type="file" name="file" accept=".csv,text/csv" required className="block min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white" />
              <button className="btn btn-secondary btn-sm"><Upload size={13} />Import</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
