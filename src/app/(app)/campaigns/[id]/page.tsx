import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FileCheck2, Pause, Pencil, Play, RefreshCw, Trash2, XCircle } from "lucide-react";
import { applyCorrectedDraft, deleteCampaign, reviewCampaign, setCampaignStatus, verifyCampaignAction } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { FindingsReport } from "@/components/FindingsReport";
import { Card, CHANNEL_LABELS, DemoBadge, EmptyState, fmtDate, KeyValue, PageHeader, Pill, RiskBadge } from "@/components/ui";
import type { CorrectedCopy } from "@/lib/ai/schemas";
import { parseJson, prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import type { ClaimAnalysis } from "@/lib/verification/types";

const DECISION_TONE: Record<string, "pass" | "block" | "review"> = { APPROVED: "pass", REJECTED: "block", CHANGES_REQUESTED: "review" };

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: { store: true, product: true, variant: true, checks: { orderBy: { createdAt: "desc" }, include: { findings: true } }, approvals: { orderBy: { createdAt: "desc" } } },
  });
  if (!c) notFound();
  const latest = c.checks[0];
  const snapshot = parseJson<{ scoreBreakdown?: { code: string; severity: string; points: number }[]; claims?: ClaimAnalysis[] }>(latest?.factsSnapshotJson, {});
  const copy = parseJson<CorrectedCopy | null>(c.correctedDraftJson, null);
  const claims = parseJson<string[]>(c.claimsJson, []);
  const cur = c.store.currency;
  const blocked = c.riskStatus === "BLOCK";

  return (
    <>
      <PageHeader
        title={c.name}
        badge={<><RiskBadge status={c.riskStatus} /><DemoBadge show={c.isDemo} /></>}
        actions={
          <>
            <form action={verifyCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-primary"><RefreshCw size={15} />Verify</button></form>
            <Link href={`/campaigns/${c.id}/edit`} className="btn btn-secondary"><Pencil size={15} />Edit</Link>
            {latest && <Link href={`/reports/${latest.id}`} className="btn btn-secondary"><FileCheck2 size={15} />Report</Link>}
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <div className="flex items-center justify-between gap-6">
              <p className="text-sm text-ink">{latest?.summary ?? "Not verified yet."}</p>
              <div className="h-display shrink-0 text-4xl tabular-nums" aria-label="Risk score">{c.riskScore ?? "—"}<span className="text-base text-steel">/100</span></div>
            </div>
            {snapshot.scoreBreakdown && snapshot.scoreBreakdown.length > 0 && (
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-muted">Score breakdown</summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">{snapshot.scoreBreakdown.map((b, i) => <li key={i} className="flex justify-between gap-2"><code>{b.code}</code><span className="tabular-nums">+{b.points}</span></li>)}</ul>
              </details>
            )}
          </Card>

          <Card title="Findings">
            {latest ? <FindingsReport findings={latest.findings} /> : <EmptyState title="Not verified yet" />}
          </Card>

          {copy && c.riskStatus !== "PASS" && (
            <Card title="Suggested fix" actions={<form action={applyCorrectedDraft}><input type="hidden" name="id" value={c.id} /><button className="btn btn-accent btn-sm">Apply as new draft</button></form>}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm text-muted">
                  <div className="label">Before</div>
                  <p className="line-through decoration-block/40">{c.headline || "—"}</p>
                  <p className="whitespace-pre-line">{c.promoText || "—"}</p>
                </div>
                <div className="space-y-2 rounded-lg bg-teal/5 p-3 text-sm ring-1 ring-teal/30">
                  <div className="label">After</div>
                  <p className="font-medium">{copy.headline}</p>
                  <p className="whitespace-pre-line">{copy.marketingText}</p>
                  <p className="text-teal-dark">{copy.cta}</p>
                </div>
              </div>
              <div className="mt-4"><div className="label">Product description</div><p className="text-sm">{copy.productDescription}</p></div>
              <p className="mt-4 text-xs text-muted">{copy.explanation}</p>
            </Card>
          )}

          {snapshot.claims && snapshot.claims.length > 0 && (
            <Card title="Claims" pad={false}>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Claim</th><th>Result</th><th>Reason</th></tr></thead>
                  <tbody>{snapshot.claims.map((a, i) => (
                    <tr key={i}><td className="min-w-48">{a.claim}</td><td><Pill tone={a.classification === "SUPPORTED" ? "pass" : a.classification === "CONTRADICTED" ? "block" : "review"}>{a.classification.charAt(0) + a.classification.slice(1).toLowerCase()}</Pill></td><td className="min-w-64 text-muted">{a.reason}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Review">
            <form action={reviewCampaign} className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <label className="sr-only" htmlFor="note">Note</label>
              <textarea id="note" name="note" className="input min-h-20" placeholder="Note" />
              <div className="flex flex-wrap gap-2">
                <button name="decision" value="APPROVED" className="btn btn-primary btn-sm" disabled={blocked || !latest} title={blocked ? "Resolve BLOCK findings first" : undefined}><CheckCircle2 size={14} />Approve</button>
                <button name="decision" value="CHANGES_REQUESTED" className="btn btn-secondary btn-sm">Request changes</button>
                <button name="decision" value="REJECTED" className="btn btn-danger btn-sm"><XCircle size={14} />Reject</button>
              </div>
            </form>
            {["APPROVED", "LIVE", "PAUSED"].includes(c.status) && (
              <form action={setCampaignStatus} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="id" value={c.id} />
                {c.status === "LIVE" ? <button name="status" value="PAUSED" className="btn btn-secondary btn-sm"><Pause size={14} />Mark paused</button> : <button name="status" value="LIVE" className="btn btn-secondary btn-sm"><Play size={14} />Mark live</button>}
              </form>
            )}
            {c.approvals.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-line pt-4">
                {c.approvals.map((a) => (
                  <li key={a.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2"><Pill tone={DECISION_TONE[a.decision] ?? "review"}>{a.decision.replace("_", " ").toLowerCase()}</Pill><span className="text-muted">{fmtDate(a.createdAt, true)}</span></div>
                    {a.note && <div className="mt-1 text-ink">{a.note}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Details">
            <KeyValue items={[
              ["Channel", CHANNEL_LABELS[c.channel]],
              ["Stage", c.status.charAt(0) + c.status.slice(1).toLowerCase()],
              ["Product", c.product ? <Link href={`/products/${c.product.id}`} className="link">{c.product.title}</Link> : "—"],
              ["Variant", c.variant?.title ?? "—"],
              ["Advertised", c.advertisedPrice ? formatMoney(c.advertisedPrice, cur) : "—"],
              ["Live price", c.variant ? formatMoney(c.variant.price, cur) : "—"],
              ["Discount", c.discountType === "NONE" ? "—" : `${c.discountType.replace("_", " ").toLowerCase()} ${c.discountValue ?? ""}`],
              ["Runs", `${fmtDate(c.startsAt)} → ${fmtDate(c.endsAt)}`],
              ["Delivery", c.deliveryPromise || "—"],
              ["URL", c.productUrl ? <span className="break-all text-xs">{c.productUrl}</span> : "—"],
            ]} />
            {claims.length > 0 && <ul className="mt-4 list-disc space-y-0.5 pl-4 text-sm">{claims.map((cl) => <li key={cl}>{cl}</li>)}</ul>}
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer text-muted">Original submission</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-cloud p-3 text-[11px]">{JSON.stringify(parseJson(c.originalSnapshot, {}), null, 2)}</pre>
            </details>
          </Card>

          {c.checks.length > 0 && (
            <Card title="History" pad={false}>
              <ul className="divide-y divide-line">
                {c.checks.slice(0, 10).map((k) => (
                  <li key={k.id}><Link href={`/reports/${k.id}`} className="flex items-center justify-between px-5 py-2.5 text-xs text-muted hover:bg-cloud"><RiskBadge status={k.riskStatus} /><span>{fmtDate(k.createdAt, true)}</span></Link></li>
                ))}
              </ul>
            </Card>
          )}

          <form action={deleteCampaign}><input type="hidden" name="id" value={c.id} /><button className="btn btn-danger btn-sm w-full"><Trash2 size={14} />Delete</button></form>
        </div>
      </div>
    </>
  );
}
