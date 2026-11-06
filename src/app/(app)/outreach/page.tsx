import Link from "next/link";
import { Sparkles } from "lucide-react";
import { generateDraftsAction } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { QueryBuilder } from "@/components/QueryBuilder";
import { Card, DemoBadge, EmptyState, Notice, PageHeader, Pill } from "@/components/ui";
import { prisma } from "@/lib/db";
import { QUALIFIED_THRESHOLD, TARGET_ROLES } from "@/lib/sales/scoring";

const INDUSTRIES = ["Shopify agency", "Fashion", "Beauty", "Homewares", "Toys", "Pet products", "Outdoor", "Multi-channel retail", "DTC"];

export default async function OutreachPage({ searchParams }: { searchParams: SP }) {
  const queue = await prisma.prospect.findMany({
    where: { outreachStatus: { in: ["NEW", "RESEARCHING", "DRAFTED"] } },
    include: { drafts: { where: { status: "DRAFT" } } },
    orderBy: { leadScore: "desc" },
  });
  return (
    <>
      <PageHeader eyebrow="Outreach Copilot" title="LinkedIn outreach copilot" subtitle="Research and drafting help for manual outreach. You do every LinkedIn interaction yourself." />
      <Flash searchParams={searchParams} />
      <div className="mb-6"><Notice tone="warn" title="Manual by design">No scraping, automated logins, connection requests or message sending. Drafts are suggestions for you to personalise, and they never claim company-specific problems you haven&apos;t recorded.</Notice></div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Search query generator">
          <QueryBuilder roles={TARGET_ROLES} industries={INDUSTRIES} />
        </Card>
        <Card className="xl:col-span-2" title="Drafting queue" subtitle="Prospects not yet contacted, highest score first" pad={false}>
          {queue.length === 0 ? <EmptyState title="Queue is empty" body="Add prospects in the CRM." /> : (
            <ul className="divide-y divide-line">
              {queue.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/prospects/${p.id}`} className="block truncate text-sm font-medium hover:text-teal-dark">{p.companyName}</Link>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">{p.contactName ?? "No contact"} · score <b className={p.leadScore >= QUALIFIED_THRESHOLD ? "text-teal-dark" : ""}>{p.leadScore}</b> <DemoBadge show={p.isDemo} /></div>
                  </div>
                  {p.drafts.length > 0 ? <Link href={`/prospects/${p.id}`} className="shrink-0"><Pill tone="teal">{p.drafts.length} drafts ready</Pill></Link> : (
                    <form action={generateDraftsAction} className="shrink-0"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="returnTo" value="/outreach" /><button className="btn btn-secondary btn-sm"><Sparkles size={13} />Draft</button></form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
