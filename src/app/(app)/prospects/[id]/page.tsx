import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";
import { deleteProspect, generateDraftsAction, markDraft, recordActivityAction, saveProspect, setProspectStatus } from "@/app/actions";
import { CopyButton } from "@/components/CopyButton";
import { Flash, type SP } from "@/components/Flash";
import { ProspectFields } from "@/components/ProspectFields";
import { Card, DemoBadge, fmtDate, PageHeader, Pill } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { OUTREACH_STATUSES, QUALIFIED_THRESHOLD, type ScoreItem } from "@/lib/sales/scoring";

const ACTIVITY_TYPES = [["NOTE", "Note"], ["CONNECTION_SENT", "Connection sent"], ["MESSAGE_SENT", "Message sent"], ["EMAIL_SENT", "Email sent"], ["REPLY", "Reply"], ["MEETING", "Meeting"], ["PILOT_OFFER", "Pilot offered"], ["CUSTOMER", "Customer"]];

export default async function ProspectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const p = await prisma.prospect.findUnique({ where: { id }, include: { activities: { orderBy: { occurredAt: "desc" } }, drafts: { orderBy: { createdAt: "desc" } } } });
  if (!p) notFound();
  const breakdown = parseJson<ScoreItem[]>(p.scoreBreakdownJson, []);
  const drafts = p.drafts.filter((d) => d.status === "DRAFT");

  return (
    <>
      <PageHeader title={p.companyName} badge={<><Pill>{p.outreachStatus.charAt(0) + p.outreachStatus.slice(1).toLowerCase()}</Pill><DemoBadge show={p.isDemo} /></>}
        actions={<>
          {p.linkedinUrl && <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><ExternalLink size={14} />LinkedIn</a>}
          <form action={generateDraftsAction}><input type="hidden" name="id" value={p.id} /><button className="btn btn-primary"><Sparkles size={14} />Generate outreach drafts</button></form>
        </>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Drafts">
            {drafts.length === 0 ? <p className="text-sm text-muted">None</p> : (
              <div className="space-y-4">
                {drafts.map((d) => (
                  <div key={d.id} className="rounded-lg border border-line p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><Pill tone="teal">{d.kind.replace("_", " ")}</Pill>{d.kind === "CONNECTION_NOTE" && <span className="text-[11px] text-muted">{d.body.length}/300 characters</span>}</div>
                      <div className="flex gap-2">
                        <CopyButton text={d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body} />
                        <form action={markDraft}><input type="hidden" name="id" value={d.id} /><button name="status" value="USED" className="btn btn-secondary btn-sm">Mark used</button></form>
                        <form action={markDraft}><input type="hidden" name="id" value={d.id} /><button name="status" value="DISCARDED" className="btn btn-secondary btn-sm">Discard</button></form>
                      </div>
                    </div>
                    {d.subject && <div className="mb-1 text-sm font-medium">Subject: {d.subject}</div>}
                    <p className="whitespace-pre-line text-sm text-ink">{d.body}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Details">
            <form action={saveProspect} className="space-y-4"><ProspectFields p={p} full /><div className="flex justify-end"><button className="btn btn-primary">Save</button></div></form>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Score">
            <div className="flex items-end justify-between"><div className="h-display text-4xl tabular-nums">{p.leadScore}<span className="text-base text-steel">/100</span></div>{p.leadScore >= QUALIFIED_THRESHOLD && <Pill tone="teal">Qualified</Pill>}</div>
            <ul className="mt-4 space-y-1.5 text-xs">{breakdown.map((b, i) => <li key={i} className="flex justify-between gap-3"><span><b className="text-ink">{b.factor}</b> <span className="text-muted">· {b.basis}</span></span><span className="tabular-nums">+{b.points}</span></li>)}</ul>
          </Card>
          <Card title="Log activity">
            <form action={recordActivityAction} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <select name="type" className="input" aria-label="Activity type">{ACTIVITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <textarea name="detail" className="input min-h-16" placeholder="Details" aria-label="Activity details" />
              <button className="btn btn-primary w-full">Log</button>
            </form>
            <form action={setProspectStatus} className="mt-4 flex gap-2 border-t border-line pt-4">
              <input type="hidden" name="id" value={p.id} />
              <select name="status" defaultValue={p.outreachStatus} className="input" aria-label="Outreach status">{OUTREACH_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              <button className="btn btn-secondary">Set</button>
            </form>
          </Card>
          <Card title="Activity" pad={false}>
            <ol className="divide-y divide-line">{p.activities.map((a) => <li key={a.id} className="px-5 py-2.5 text-xs"><div className="flex justify-between gap-2"><b className="text-ink">{a.type.replace(/_/g, " ").toLowerCase()}</b><span className="text-muted">{fmtDate(a.occurredAt, true)}</span></div>{a.detail && <div className="mt-0.5 text-muted">{a.detail}</div>}</li>)}</ol>
          </Card>
          <form action={deleteProspect}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger btn-sm w-full">Delete prospect</button></form>
        </div>
      </div>
    </>
  );
}
