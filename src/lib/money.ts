import Decimal from "decimal.js";

// Monetary values are handled as decimal strings end-to-end. Never use JS floats
// for price comparisons.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[$,\s]/g, "").replace(/^AUD|^A\$/i, "");
  if (s === "") return null;
  try {
    const d = new Decimal(s);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/** Exact comparison: "189" equals "189.00", but "188.999" does not. No rounding is applied. */
export function moneyEquals(a: Decimal, b: Decimal): boolean {
  return a.equals(b);
}

export function formatMoney(value: string | Decimal | null | undefined, currency = "AUD"): string {
  if (value === null || value === undefined) return "—";
  const d = value instanceof Decimal ? value : toDecimal(value);
  if (!d) return "—";
  const symbol = currency === "AUD" || currency === "USD" || currency === "NZD" || currency === "CAD" ? "$" : "";
  return `${symbol}${d.toFixed(2)}${symbol ? "" : " " + currency}`;
}

/** Percentage discount from reference to sale price, rounded to 2dp. */
export function discountPercent(reference: Decimal, sale: Decimal): Decimal {
  if (reference.lte(0)) return new Decimal(0);
  return reference.minus(sale).div(reference).times(100).toDecimalPlaces(2);
}

/** Extracts dollar amounts written in copy, e.g. "$49.95", "A$120", "$1,299". */
export function extractPrices(text: string): Decimal[] {
  const out: Decimal[] = [];
  const re = /(?:A\$|AU\$|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = toDecimal(m[1]);
    if (d) out.push(d);
  }
  return out;
}

/** Extracts "40% off" style claims. */
export function extractPercentOff(text: string): Decimal[] {
  const out: Decimal[] = [];
  const re = /(\d{1,3}(?:\.\d+)?)\s?%\s?(?:off|discount|saving|savings)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = toDecimal(m[1]);
    if (d) out.push(d);
  }
  return out;
}

export { Decimal };
