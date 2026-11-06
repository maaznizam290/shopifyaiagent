import { z } from "zod/v4";

export const BUSINESS_TYPES = ["AGENCY_MARKETING", "AGENCY_DEV", "DTC_BRAND", "RETAILER", "OTHER"] as const;
export const OUTREACH_STATUSES = ["NEW", "RESEARCHING", "DRAFTED", "MESSAGED", "REPLIED", "MEETING", "PILOT", "CUSTOMER", "DISQUALIFIED"] as const;
export const TARGET_INDUSTRIES = ["fashion", "apparel", "beauty", "cosmetics", "skincare", "homewares", "home", "furniture", "toys", "pet", "outdoor", "multi-channel", "e-commerce", "ecommerce", "marketing agency", "development agency"];
export const TARGET_ROLES = ["Founder", "Co-Founder", "CEO", "Managing Director", "E-commerce Manager", "Head of E-commerce", "Head of Growth", "Marketing Director", "Agency Owner"];
export const AU_LOCATIONS = ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Hobart", "Newcastle", "Australia"];

export const ProspectInputSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  contactName: z.string().trim().max(200).optional().nullable(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  website: z.union([z.url({ protocol: /^https?$/ }), z.literal("")]).optional().nullable(),
  linkedinUrl: z
    .union([z.url().refine((u) => /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(u), "Must be a linkedin.com URL"), z.literal("")])
    .optional()
    .nullable(),
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  country: z.string().trim().max(100).default("Australia"),
  industry: z.string().trim().max(200).optional().nullable(),
  businessType: z.enum(BUSINESS_TYPES).optional().nullable(),
  shopifyEvidence: z.string().trim().max(2000).default(""),
  shopifyVerified: z.boolean().default(false),
  employeeCount: z.number().int().positive().optional().nullable(),
  problemHypothesis: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(5000).default(""),
});
export type ProspectInput = z.infer<typeof ProspectInputSchema>;

export interface ScoreItem {
  factor: string;
  points: number;
  basis: string;
}

export const QUALIFIED_THRESHOLD = 60;

/** Lead qualification from recorded, verifiable information only. Unknown fields score zero. */
export function scoreProspect(p: Partial<ProspectInput>): { score: number; breakdown: ScoreItem[]; qualified: boolean } {
  const items: ScoreItem[] = [];
  const typePts: Record<string, number> = { AGENCY_MARKETING: 20, AGENCY_DEV: 18, DTC_BRAND: 18, RETAILER: 15, OTHER: 5 };
  if (p.businessType) items.push({ factor: "Business type fit", points: typePts[p.businessType] ?? 0, basis: p.businessType });

  const ind = (p.industry ?? "").toLowerCase();
  if (ind && TARGET_INDUSTRIES.some((t) => ind.includes(t))) items.push({ factor: "Target industry", points: 10, basis: p.industry! });

  const loc = `${p.location ?? ""} ${p.country ?? ""}`.toLowerCase();
  if (/australia|\b(nsw|vic|qld|wa|sa|tas|act|nt)\b/.test(loc) || AU_LOCATIONS.some((l) => loc.includes(l.toLowerCase()))) items.push({ factor: "Initial market (Australia)", points: 15, basis: [p.location, p.country].filter(Boolean).join(", ") });

  if (p.shopifyVerified) items.push({ factor: "Shopify usage verified", points: 20, basis: p.shopifyEvidence || "Marked verified" });
  else if (p.shopifyEvidence) items.push({ factor: "Shopify evidence (unverified)", points: 5, basis: p.shopifyEvidence });

  const title = (p.jobTitle ?? "").toLowerCase();
  if (/founder|ceo|chief executive|owner|managing director|head of (e-?commerce|growth|digital|marketing)|e-?commerce (manager|director|lead)|marketing director|director of marketing|growth lead/.test(title)) {
    items.push({ factor: "Decision-maker role", points: 20, basis: p.jobTitle! });
  } else if (/manager|lead|director/.test(title)) {
    items.push({ factor: "Influencer role", points: 8, basis: p.jobTitle! });
  }

  if (p.linkedinUrl || p.email) items.push({ factor: "Contact route recorded", points: 5, basis: p.email ? "Email" : "LinkedIn profile" });
  if (p.website) items.push({ factor: "Website recorded", points: 5, basis: p.website });
  if (p.problemHypothesis) items.push({ factor: "Problem hypothesis documented", points: 5, basis: "Hypothesis (to be validated)" });

  const score = Math.min(100, items.reduce((s, i) => s + i.points, 0));
  return { score, breakdown: items, qualified: score >= QUALIFIED_THRESHOLD };
}

// ---------------------------------------------------------------------------
// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length < 2) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const HEADER_MAP: Record<string, keyof ProspectInput> = {
  company: "companyName", companyname: "companyName", "company name": "companyName",
  name: "contactName", contact: "contactName", contactname: "contactName", "contact name": "contactName",
  title: "jobTitle", jobtitle: "jobTitle", "job title": "jobTitle", role: "jobTitle",
  website: "website", url: "website", linkedin: "linkedinUrl", linkedinurl: "linkedinUrl", "linkedin url": "linkedinUrl",
  email: "email", location: "location", city: "location", country: "country", industry: "industry",
  businesstype: "businessType", "business type": "businessType", type: "businessType",
  shopifyevidence: "shopifyEvidence", "shopify evidence": "shopifyEvidence", shopifyverified: "shopifyVerified", "shopify verified": "shopifyVerified",
  employees: "employeeCount", employeecount: "employeeCount", hypothesis: "problemHypothesis", problemhypothesis: "problemHypothesis", "problem hypothesis": "problemHypothesis", notes: "notes",
};

export function csvRowToProspect(row: Record<string, string>): { ok: true; data: ProspectInput } | { ok: false; error: string } {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = HEADER_MAP[k.toLowerCase().trim()];
    if (!key || v === "") continue;
    if (key === "shopifyVerified") mapped[key] = /^(true|yes|y|1)$/i.test(v);
    else if (key === "employeeCount") mapped[key] = Number.parseInt(v, 10) || undefined;
    else if (key === "businessType") mapped[key] = v.toUpperCase().replace(/[^A-Z]+/g, "_");
    else mapped[key] = v;
  }
  const parsed = ProspectInputSchema.safeParse(mapped);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: parsed.data };
}
