import { BRAND_NAME, MARK } from "@/lib/brand";

/** The PromiSure AI mark (shopping bag). Identical to the favicon. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox={MARK.viewBox} aria-hidden="true">
      <rect width="32" height="32" rx={MARK.background.rx} fill={MARK.background.fill} />
      {MARK.shapes.map((s) => (
        <path key={s.d} d={s.d} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap={s.linecap} strokeLinejoin={s.linejoin} />
      ))}
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={42} />
      <div className="h-display text-[19px] leading-none tracking-[0.02em] text-white">{BRAND_NAME}</div>
    </div>
  );
}
