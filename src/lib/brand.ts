/**
 * Single source of truth for the PromiSure AI mark: a shopping bag.
 * The in-app <LogoMark>, public/icon.svg and src/app/favicon.ico are all generated from this
 * (run `npm run icons` after changing it; a unit test fails if the files drift).
 */
export const BRAND_NAME = "PromiSure AI";

export const MARK = {
  viewBox: "0 0 32 32",
  background: { rx: 7, fill: "#172335" },
  shapes: [
    // Bag body (fills most of the tile)
    { d: "M7 11h18l1.5 15.2a2 2 0 0 1-2 2.3H7.5a2 2 0 0 1-2-2.3L7 11Z", stroke: "#28B8A5", strokeWidth: 2.4, linecap: "round", linejoin: "round" },
    // Handle
    { d: "M11.5 11V8.6a4.5 4.5 0 0 1 9 0V11", stroke: "#28B8A5", strokeWidth: 2.4, linecap: "round", linejoin: "round" },
  ],
} as const;

/** Standalone SVG markup of the mark, used for the favicon files. */
export function markSvg(): string {
  const paths = MARK.shapes
    .map((s) => `<path d="${s.d}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="${s.linecap}" stroke-linejoin="${s.linejoin}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.viewBox}"><rect width="32" height="32" rx="${MARK.background.rx}" fill="${MARK.background.fill}"/>${paths}</svg>\n`;
}
