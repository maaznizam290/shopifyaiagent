import type { ClaimAnalysis, FactInput } from "@/lib/verification/types";

// Deterministic claim analysis. Always runs. AI analysis (when configured) is
// layered on top and can never turn a rule-detected contradiction into a pass.

/** Only approved, non-AI facts count as evidence. */
export function eligibleFacts(facts: FactInput[]): FactInput[] {
  return facts.filter(
    (f) => f.approved && (f.verificationStatus === "VERIFIED" || f.verificationStatus === "MERCHANT_ENTERED") && f.source !== "AI_SUGGESTION",
  );
}

interface ContradictionRule {
  name: string;
  claim: RegExp;
  fact: RegExp;
  /** If the fact also matches this, it actually supports the claim. */
  factSupports?: RegExp;
  rewrite: (claim: string, fact: FactInput) => string;
  reason: string;
}

const RULES: ContradictionRule[] = [
  {
    name: "waterproof",
    claim: /\b(?:100%\s*)?water[- ]?proof\b/i,
    fact: /\bwater[- ]?resistant\b|\bwater[- ]?repellent\b|\bsplash[- ]?(?:proof|resistant)\b|\bshower[- ]?proof\b|\bnot waterproof\b/i,
    factSupports: /(?<!not\s)\bwater[- ]?proof\b/i,
    rewrite: (c) => c.replace(/\b(?:100%\s*)?water[- ]?proof\b/i, "water-resistant"),
    reason: "The approved product information supports water resistance, not a waterproof guarantee.",
  },
  {
    name: "solid-wood",
    claim: /\bsolid\s+(?:oak|wood|timber|walnut|pine|hardwood)\b/i,
    fact: /\bveneer\b|\bengineered\b|\bmdf\b|\bparticle ?board\b/i,
    rewrite: (c, f) => c.replace(/\bsolid\s+(oak|wood|timber|walnut|pine|hardwood)\b/i, (_m, w) => (/veneer/i.test(f.statement) ? `${w} veneer` : `engineered ${w}`)),
    reason: "The approved materials describe veneer/engineered wood, not solid wood.",
  },
  {
    name: "genuine-leather",
    claim: /\b(?:genuine|real|full[- ]grain|100%)\s+leather\b/i,
    fact: /\bfaux\b|\bvegan leather\b|\bpu\b|\bpolyurethane\b|\bsynthetic\b|\bbonded leather\b/i,
    rewrite: (c) => c.replace(/\b(?:genuine|real|full[- ]grain|100%)\s+leather\b/i, "vegan leather"),
    reason: "The approved materials describe a synthetic/faux leather, not genuine leather.",
  },
  {
    name: "dishwasher-safe",
    claim: /\bdishwasher[- ]safe\b/i,
    fact: /\bhand[- ]wash only\b|\bnot dishwasher[- ]safe\b/i,
    rewrite: (c) => c.replace(/\bdishwasher[- ]safe\b/i, "hand-wash recommended"),
    reason: "The approved care instructions specify hand washing only.",
  },
  {
    name: "machine-washable",
    claim: /\bmachine[- ]washable\b/i,
    fact: /\bhand[- ]wash only\b|\bdry[- ]clean only\b/i,
    rewrite: (c, f) => c.replace(/\bmachine[- ]washable\b/i, /dry/i.test(f.statement) ? "dry-clean only" : "hand-wash only"),
    reason: "The approved care instructions do not allow machine washing.",
  },
  {
    name: "bpa-free",
    claim: /\bbpa[- ]free\b/i,
    fact: /\bcontains bpa\b/i,
    rewrite: (c) => c.replace(/\bbpa[- ]free\b/i, "").replace(/\s{2,}/g, " ").trim(),
    reason: "The approved product information states the product contains BPA.",
  },
  {
    name: "pure-material",
    claim: /\b100%\s*(cotton|wool|silk|linen|cashmere|merino)\b/i,
    fact: /\bblend\b|\b(?:[1-9]\d?)%\s*(?:cotton|wool|silk|linen|cashmere|merino|polyester|elastane|nylon)\b/i,
    factSupports: /\b100%\s*(cotton|wool|silk|linen|cashmere|merino)\b/i,
    rewrite: (c, f) => c.replace(/\b100%\s*(cotton|wool|silk|linen|cashmere|merino)\b/i, (_m, mat) => {
      const pct = f.statement.match(new RegExp(`(\\d{1,2})%\\s*${mat}`, "i"));
      return pct ? `${pct[1]}% ${mat} blend` : `${mat} blend`;
    }),
    reason: "The approved composition is a blend, not a single pure material.",
  },
];

/** Words that need explicit evidence; they are never "supported" by loose overlap. */
// (?<!\w)…(?!\w) rather than \b so terms such as "100%" and "#1" match.
const ABSOLUTE_TERMS = /(?<!\w)(best|#1|number one|guarantee[ds]?|lifetime|clinically|proven|certified|approved|award[- ]winning|unbreakable|indestructible|never|always|cure[sd]?|eliminates?|100%|hypoallergenic|non[- ]toxic|organic|eco[- ]friendly|sustainable|safe)(?!\w)/gi;

const STOP = new Set(
  "the a an and or for with of to in on our your this that is are be by from it its at as all new made into you will can more most very just than has have".split(" "),
);
const NEGATIONS = new Set(["not", "no", "never", "non", "without", "isnt", "arent", "doesnt", "dont", "cannot", "cant", "unsuitable"]);
const stem = (t: string) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t);

interface ScannedToken {
  tok: string;
  negated: boolean;
}

/**
 * Content tokens in order, each flagged if it falls in a negation's scope. The prefix "non"
 * and "without" cover the next content token; other negations cover the next two; scope ends
 * at punctuation. Numbers are kept.
 */
function scan(s: string): ScannedToken[] {
  const raw = s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[,;:!?()]|\.(?!\d)/g, " | ")
    .replace(/[^a-z0-9%+.|\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const out: ScannedToken[] = [];
  let window = 0;
  for (const w of raw) {
    if (w === "|") {
      window = 0;
      continue;
    }
    if (NEGATIONS.has(w)) {
      window = w === "non" || w === "without" ? 1 : 2;
      continue;
    }
    const isNumber = /^\d+(?:\.\d+)?%?$/.test(w);
    if (!isNumber && (w.length < 3 || STOP.has(w))) continue;
    out.push({ tok: isNumber ? w : stem(w), negated: window > 0 });
    if (window > 0) window--;
  }
  return out;
}

function tokens(s: string): string[] {
  return scan(s).map((t) => t.tok);
}

const isNumeric = (t: string) => /^\d/.test(t);

// "X-free" / "free from X" claims, checked against facts stating the product contains X.
const FREE_FROM = /(?:\b([a-z]{3,})[- ]free\b|\bfree (?:from|of) ([a-z]{3,}))/i;
const NOT_SUBSTANCES = new Set(["shipping", "delivery", "postage", "returns", "return", "trial", "gift", "hassle", "worry", "stress", "care", "maintenance"]);

function ageMin(s: string): number | null {
  const m = s.match(/\bages?\s*(\d{1,2})\s*(?:\+|and up|years? and up|-\s*\d+)/i) ?? s.match(/\b(\d{1,2})\s*\+\s*(?:years?|yrs?)?/i) ?? s.match(/\b(\d{1,2})\s*(?:years?|yrs?)\s*(?:and up|\+|or older)/i);
  return m ? Number(m[1]) : null;
}

const UNIT_RE = /(\d+(?:\.\d+)?)\s*(cm|mm|kg|g|ml|l|litres?|liters?|hours?|hrs?|watts?|w|mah|inch(?:es)?|")\b/gi;
function measures(s: string): { value: number; unit: string }[] {
  const out: { value: number; unit: string }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(UNIT_RE.source, "gi");
  while ((m = re.exec(s)) !== null) {
    let unit = m[2].toLowerCase();
    if (unit.startsWith("hour") || unit.startsWith("hr")) unit = "h";
    if (unit.startsWith("litre") || unit.startsWith("liter")) unit = "l";
    if (unit.startsWith("watt")) unit = "w";
    if (unit.startsWith("inch") || unit === '"') unit = "in";
    out.push({ value: Number(m[1]), unit });
  }
  return out;
}

/** Extracts claim-like phrases from free copy so they get checked even if the merchant didn't list them. */
export function extractImplicitClaims(copy: string): string[] {
  const found: string[] = [];
  const sentences = copy.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const triggers = RULES.some((r) => r.claim.test(s)) || new RegExp(ABSOLUTE_TERMS.source, "i").test(s) || ageMin(s) !== null || measures(s).length > 0;
    // Price, discount and delivery language are checked deterministically elsewhere.
    const commercialOnly = /^[^a-z]*$|% off|\$\d|free shipping|delivery|dispatch/i.test(s) && !RULES.some((r) => r.claim.test(s));
    if (triggers && !commercialOnly) found.push(s.replace(/[.!]+$/, ""));
  }
  return found;
}

export function analyzeClaimWithRules(claim: string, facts: FactInput[]): ClaimAnalysis {
  const approved = eligibleFacts(facts);
  const base = { claim, supportingFactIds: [] as string[], contradictingFactIds: [] as string[], suggestedRewrite: null as string | null, analyzer: "rules" };

  // 1. Known contradiction pairs.
  for (const rule of RULES) {
    if (!rule.claim.test(claim)) continue;
    const supporting = rule.factSupports ? approved.filter((f) => rule.factSupports!.test(f.statement)) : [];
    if (supporting.length) {
      return { ...base, classification: "SUPPORTED", reason: `Approved product information confirms the "${rule.name}" attribute.`, supportingFactIds: supporting.map((f) => f.id) };
    }
    const contra = approved.filter((f) => rule.fact.test(f.statement));
    if (contra.length) {
      return { ...base, classification: "CONTRADICTED", reason: rule.reason, contradictingFactIds: contra.map((f) => f.id), suggestedRewrite: rule.rewrite(claim, contra[0]) };
    }
  }

  // 1b. "Free from X" claims vs facts that say the product contains X.
  const ff = claim.match(FREE_FROM);
  const substance = ff ? (ff[1] ?? ff[2]).toLowerCase() : null;
  if (substance && !NOT_SUBSTANCES.has(substance)) {
    const s = stem(substance);
    const contains = approved.filter((f) => new RegExp(`\\bcontains?\\b[^.]*\\b${s}`, "i").test(f.statement));
    if (contains.length) {
      return {
        ...base,
        classification: "CONTRADICTED",
        reason: `The claim says the product is free from ${substance}, but approved product information states it contains ${substance}.`,
        contradictingFactIds: contains.map((f) => f.id),
        suggestedRewrite: claim.replace(FREE_FROM, "").replace(/\s{2,}/g, " ").trim() || null,
      };
    }
    const confirms = approved.filter((f) => new RegExp(`\\b${s}s?[- ]free\\b|\\bfree (?:from|of) ${s}`, "i").test(f.statement));
    if (confirms.length) return { ...base, classification: "SUPPORTED", reason: `Approved product information confirms it is free from ${substance}.`, supportingFactIds: confirms.map((f) => f.id) };
  }

  // 2. Age recommendations (safety-relevant).
  const claimAge = ageMin(claim);
  if (claimAge !== null) {
    const ageFacts = approved.filter((f) => ageMin(f.statement) !== null);
    if (ageFacts.length) {
      const factAge = Math.max(...ageFacts.map((f) => ageMin(f.statement)!));
      if (claimAge < factAge) {
        return {
          ...base,
          classification: "CONTRADICTED",
          reason: `The approved age recommendation is ${factAge}+. The claim suggests suitability from age ${claimAge}.`,
          contradictingFactIds: ageFacts.map((f) => f.id),
          suggestedRewrite: claim.replace(/\b\d{1,2}\s*\+|\bages?\s*\d{1,2}\s*(?:\+|and up)/i, `ages ${factAge}+`),
        };
      }
      return { ...base, classification: "SUPPORTED", reason: `Consistent with the approved age recommendation (${factAge}+).`, supportingFactIds: ageFacts.map((f) => f.id) };
    }
  }

  // 3. Measurable values (dimensions, capacity, battery life).
  const cm = measures(claim);
  if (cm.length) {
    const claimTok = new Set(tokens(claim.replace(UNIT_RE, " ")));
    for (const m of cm) {
      const related = approved.filter((f) => measures(f.statement).some((x) => x.unit === m.unit) && tokens(f.statement).some((t) => claimTok.has(t)));
      if (!related.length) continue;
      const values = related.flatMap((f) => measures(f.statement).filter((x) => x.unit === m.unit).map((x) => x.value));
      if (values.includes(m.value) || (m.unit === "h" && m.value <= Math.max(...values))) {
        return { ...base, classification: "SUPPORTED", reason: `The measured value ${m.value}${m.unit} matches approved product information.`, supportingFactIds: related.map((f) => f.id) };
      }
      const best = m.unit === "h" ? Math.max(...values) : values[0];
      return {
        ...base,
        classification: "CONTRADICTED",
        reason: `The claim states ${m.value}${m.unit}. Approved product information states ${values.join(", ")}${m.unit}.`,
        contradictingFactIds: related.map((f) => f.id),
        suggestedRewrite: claim.replace(new RegExp(`(?:up to\\s+)?${m.value}\\s*\\w*`), m.unit === "h" ? `up to ${best} hours` : `${best}${m.unit}`),
      };
    }
  }

  // 4. Lexical support. Absolute or regulated terms need an exact match in a fact,
  //    every number in the claim must appear in the fact, and negation must agree.
  const absolutes = (claim.match(ABSOLUTE_TERMS) ?? []).map((a) => a.toLowerCase());
  const cs = scan(claim);
  const ct = cs.map((t) => t.tok);
  const claimNegated = new Set(cs.filter((t) => t.negated).map((t) => t.tok));
  if (ct.length) {
    for (const fact of approved) {
      const fs = scan(fact.statement);
      const ft = new Set(fs.map((t) => t.tok));
      const shared = ct.filter((t) => ft.has(t));
      const overlap = shared.length / ct.length;
      if (overlap < 0.75) continue;
      // Negation mismatch: "Machine washable" vs "Not machine washable".
      const factNegated = new Set(fs.filter((t) => t.negated).map((t) => t.tok));
      const flipped = shared.filter((t) => !isNumeric(t) && factNegated.has(t) !== claimNegated.has(t));
      if (flipped.length) {
        return {
          ...base,
          classification: "CONTRADICTED",
          reason: `Approved product information states the opposite: "${fact.statement}".`,
          contradictingFactIds: [fact.id],
          suggestedRewrite: null,
        };
      }
      const numbersCovered = ct.filter(isNumeric).every((n) => ft.has(n));
      const absolutesCovered = absolutes.every((a) => fact.statement.toLowerCase().includes(a));
      if (numbersCovered && absolutesCovered) {
        return { ...base, classification: "SUPPORTED", reason: "The claim matches approved product information.", supportingFactIds: [fact.id] };
      }
    }
  }

  return {
    ...base,
    classification: "UNVERIFIABLE",
    reason: absolutes.length
      ? `The claim uses terms that need evidence (${[...new Set(absolutes)].join(", ")}), and no approved fact supports them.`
      : "No approved product fact supports this claim.",
  };
}
