// Simple accessible horizontal bar list (single series, one hue; values labelled directly).
export function BarList({ rows, tone = "bg-teal", max }: { rows: { label: string; value: number; hint?: string }[]; tone?: string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-xs"><span className="text-ink">{r.label}</span><span className="font-semibold tabular-nums text-ink">{r.value}{r.hint && <span className="ml-1 font-normal text-muted">{r.hint}</span>}</span></div>
          <div className="h-2 rounded-full bg-cloud" role="img" aria-label={`${r.label}: ${r.value}`}>
            <div className={`h-2 rounded-full ${tone}`} style={{ width: `${(r.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
