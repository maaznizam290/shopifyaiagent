import Link from "next/link";
import { AlertOctagon, CheckCircle2, CircleHelp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Page title row. `badge` sits beside the title (status, demo label); `actions` align right. */
export function PageHeader({ title, badge, actions }: { title: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="h-display text-2xl text-ink">{title}</h1>
        {badge}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, { cls: string; icon: LucideIcon; label: string }> = {
  PASS: { cls: "bg-pass-bg text-pass ring-pass/20", icon: CheckCircle2, label: "PASS" },
  REVIEW: { cls: "bg-review-bg text-review ring-review/25", icon: CircleHelp, label: "REVIEW" },
  BLOCK: { cls: "bg-block-bg text-block ring-block/20", icon: AlertOctagon, label: "BLOCK" },
};

export function RiskBadge({ status, size = "md" }: { status: string | null | undefined; size?: "md" | "lg" }) {
  if (!status) return <span className="inline-flex rounded-full bg-cloud px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">NOT CHECKED</span>;
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.REVIEW;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wide ring-1 ${s.cls} ${size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"}`}>
      <Icon size={size === "lg" ? 16 : 13} aria-hidden />
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "teal" | "brass" | "pass" | "review" | "block" | "ink" }) {
  const tones = {
    neutral: "bg-cloud text-muted ring-line",
    teal: "bg-teal/10 text-teal-dark ring-teal/25",
    brass: "bg-brass/10 text-[#9a6f22] ring-brass/30",
    pass: "bg-pass-bg text-pass ring-pass/20",
    review: "bg-review-bg text-review ring-review/25",
    block: "bg-block-bg text-block ring-block/20",
    ink: "bg-ink text-white ring-ink",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return <Pill tone="brass">Demo</Pill>;
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : <span />}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? "card-pad" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone, href }: { label: string; value: ReactNode; tone?: "pass" | "review" | "block" | "teal" | "brass"; href?: string }) {
  const bar = { pass: "bg-pass", review: "bg-review", block: "bg-block", teal: "bg-teal", brass: "bg-brass" };
  const body = (
    <div className="card relative overflow-hidden px-5 py-4 transition-shadow hover:shadow-md">
      {tone && <span className={`absolute inset-y-0 left-0 w-1 ${bar[tone]}`} aria-hidden />}
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="h-display mt-1.5 text-[28px] leading-none text-ink">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function EmptyState({ title, action, icon: Icon }: { title: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <Icon size={28} className="mb-3 text-steel" aria-hidden />}
      <div className="text-sm font-semibold text-ink">{title}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KeyValue({ items, columns = 2 }: { items: [string, ReactNode][]; columns?: 1 | 2 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SeverityPill({ severity }: { severity: string }) {
  const tone = severity === "CRITICAL" || severity === "HIGH" ? "block" : severity === "MEDIUM" ? "review" : severity === "LOW" ? "brass" : "neutral";
  return <Pill tone={tone}>{severity}</Pill>;
}

export function OutcomeDot({ outcome }: { outcome: string }) {
  const c = outcome === "PASS" ? "bg-pass" : outcome === "BLOCK" ? "bg-block" : "bg-review";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} aria-label={outcome} />;
}

export function FactSourceBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "pass" | "teal" | "neutral" | "brass"; label: string }> = {
    VERIFIED: { tone: "pass", label: "Verified" },
    MERCHANT_ENTERED: { tone: "teal", label: "Merchant" },
    UNVERIFIED: { tone: "neutral", label: "Unverified" },
    AI_SUGGESTION: { tone: "brass", label: "AI suggestion" },
  };
  const m = map[status] ?? map.UNVERIFIED;
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU", withTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" });
}

export const CHANNEL_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok", GOOGLE_SHOPPING: "Google Shopping", GOOGLE_ADS: "Google Ads", PINTEREST: "Pinterest", EMAIL: "Email", OTHER: "Other",
};

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-teal/30 bg-teal/5 text-ink",
    warn: "border-review/30 bg-review-bg text-ink",
    danger: "border-block/30 bg-block-bg text-ink",
    success: "border-pass/30 bg-pass-bg text-ink",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}
