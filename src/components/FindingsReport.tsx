import type { VerificationFinding } from "@prisma/client";
import { OutcomeDot, SeverityPill } from "./ui";

const TYPE_LABELS: Record<string, string> = {
  PRICE: "Price",
  INVENTORY: "Inventory",
  PRODUCT_STATUS: "Product status",
  PROMOTION: "Promotion",
  CLAIM: "Claims",
  SHIPPING: "Shipping",
  DESTINATION: "Landing page",
};
const ORDER = Object.keys(TYPE_LABELS);
const rank = (o: string) => (o === "BLOCK" ? 0 : o === "REVIEW" ? 1 : 2);

export function FindingsReport({ findings, compact = false }: { findings: VerificationFinding[]; compact?: boolean }) {
  const groups = ORDER.map((t) => ({ type: t, items: findings.filter((f) => f.type === t).sort((a, b) => rank(a.outcome) - rank(b.outcome)) })).filter((g) => g.items.length);
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const worst = g.items[0].outcome;
        return (
          <div key={g.type}>
            <div className="mb-2 flex items-center gap-2">
              <OutcomeDot outcome={worst} />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{TYPE_LABELS[g.type]}</h3>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              {g.items.map((f) => (
                <div key={f.id} className={`border-b border-line px-4 py-3 last:border-b-0 ${f.outcome === "BLOCK" ? "bg-block-bg/40" : f.outcome === "REVIEW" ? "bg-review-bg/40" : "bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold tracking-wide ${f.outcome === "BLOCK" ? "text-block" : f.outcome === "REVIEW" ? "text-review" : "text-pass"}`}>{f.outcome}</span>
                    <SeverityPill severity={f.severity} />
                    <code className="text-[11px] text-muted">{f.code}</code>
                  </div>
                  <div className={`mt-2 grid gap-x-6 gap-y-2 text-sm ${compact ? "" : "md:grid-cols-2"}`}>
                    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Campaign</div><div className="text-ink">{f.originalClaim}</div></div>
                    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Store</div><div className="text-ink">{f.verifiedInfo}</div></div>
                    {f.outcome !== "PASS" && <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Fix</div><div className="text-ink">{f.recommendation}</div></div>}
                    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Evidence</div><div className="text-xs text-muted">{f.sourceEvidence}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
