import Link from "next/link";
import { notFound } from "next/navigation";
import { FindingsReport } from "@/components/FindingsReport";
import { LogoMark } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { Card, CHANNEL_LABELS, DemoBadge, fmtDate, KeyValue, RiskBadge } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import type { DestinationResult, ProductInput, VariantInput } from "@/lib/verification/types";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const k = await prisma.campaignCheck.findUnique({ where: { id }, include: { findings: true, campaign: { include: { store: true } } } });
  if (!k) notFound();
  const c = k.campaign;
  const snap = parseJson<{ variant?: VariantInput; product?: ProductInput; destination?: DestinationResult; scoreBreakdown?: { code: string; severity: string; points: number }[] }>(k.factsSnapshotJson, {});
  const n = (o: string) => k.findings.filter((f) => f.outcome === o).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/campaigns/${c.id}`} className="link text-sm">← Back to campaign</Link>
        <PrintButton />
      </div>
      <article className="card overflow-hidden">
        <header className="flex flex-col gap-4 bg-ink px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><LogoMark size={36} /><div><div className="h-display tracking-[0.12em]">PROMISURE AI · VERIFICATION REPORT</div><div className="text-xs text-steel">Report {k.id} · {k.createdAt.toISOString()}</div></div></div>
          <RiskBadge status={k.riskStatus} size="lg" />
        </header>
        <div className="space-y-6 p-6">
          <div className="flex flex-wrap items-center gap-2"><h1 className="h-display text-xl">{c.name}</h1><DemoBadge show={c.isDemo} /></div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-cloud p-3"><div className="label">Risk score</div><div className="h-display text-2xl">{k.riskScore}/100</div></div>
            <div className="rounded-lg bg-block-bg p-3"><div className="label">Block</div><div className="h-display text-2xl text-block">{n("BLOCK")}</div></div>
            <div className="rounded-lg bg-review-bg p-3"><div className="label">Review</div><div className="h-display text-2xl text-review">{n("REVIEW")}</div></div>
            <div className="rounded-lg bg-pass-bg p-3"><div className="label">Pass</div><div className="h-display text-2xl text-pass">{n("PASS")}</div></div>
          </div>
          <p className="text-sm">{k.summary}</p>
          <Card title="Scope">
            <KeyValue items={[
              ["Store", `${c.store.name} (${c.store.shopDomain})`],
              ["Channel", CHANNEL_LABELS[c.channel]],
              ["Trigger", k.trigger],
              ["Claim analysis", k.aiProvider ?? "rules"],
              ["Product at check time", snap.product ? `${snap.product.title} · ${snap.product.status}` : "—"],
              ["Variant at check time", snap.variant ? `${snap.variant.title} · ${formatMoney(snap.variant.price, c.store.currency)} · qty ${snap.variant.inventoryTracked ? (snap.variant.inventoryQuantity ?? "n/a") : "untracked"}` : "—"],
              ["Destination", snap.destination ? `${snap.destination.status}${snap.destination.simulated ? " (simulated)" : ""} · ${snap.destination.finalUrl ?? ""}` : "—"],
              ["Generated", fmtDate(k.createdAt, true)],
            ]} />
          </Card>
          <FindingsReport findings={k.findings} />
          <footer className="border-t border-line pt-4 text-[11px] text-muted">
            Price, inventory, status, date and URL checks are deterministic and use decimal arithmetic. Claims are assessed only against approved product facts; unverifiable claims are never passed. Delivery claims are compared with merchant-configured policies, not inventory data.
            This report covers the registered campaign content only. {c.isDemo && "This report was generated from DEMO DATA."}
          </footer>
        </div>
      </article>
    </div>
  );
}
