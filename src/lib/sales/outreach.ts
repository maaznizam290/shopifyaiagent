// Outreach Copilot. Drafts only: PromiSure AI never logs in to LinkedIn, scrapes
// profiles, sends connection requests or sends messages. The user copies drafts
// and performs every interaction manually.

export interface DraftProspect {
  companyName: string;
  contactName?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  businessType?: string | null;
  location?: string | null;
  shopifyVerified?: boolean;
  problemHypothesis?: string | null;
}

const firstName = (n?: string | null) => (n ? n.trim().split(/\s+/)[0] : "there");

function angle(p: DraftProspect): string {
  switch (p.businessType) {
    case "AGENCY_MARKETING":
      return "agencies running promotions for several Shopify clients at once";
    case "AGENCY_DEV":
      return "Shopify development teams supporting merchants through busy sale periods";
    case "DTC_BRAND":
    case "RETAILER":
      return "Shopify brands running frequent promotions across social, search and email";
    default:
      return "Shopify merchants running promotions across several channels";
  }
}

/** LinkedIn connection notes are limited to 300 characters. */
export function connectionNote(p: DraftProspect): string {
  const role = p.jobTitle ? ` as ${p.jobTitle}` : "";
  const note = `Hi ${firstName(p.contactName)}, I came across your work${role} at ${p.companyName}. I'm building PromiSure AI at NousGen, which checks campaign prices, stock and claims against live Shopify data before launch. I'd value connecting with people in ${p.location?.split(",")[0] || "Australian"} e-commerce.`;
  return note.length <= 300 ? note : `Hi ${firstName(p.contactName)}, I'm building PromiSure AI at NousGen, which checks Shopify campaigns against live store data before launch. I'd value connecting with you and ${p.companyName}.`.slice(0, 300);
}

export function followUpMessage(p: DraftProspect): string {
  const hypothesis = p.problemHypothesis
    ? `\n\nOne thing I'm curious about (just a guess, I may be wrong): ${p.problemHypothesis.replace(/\.$/, "")}. Is that something your team runs into?`
    : `\n\nI'm curious whether keeping ad copy in sync with Shopify pricing and stock is something your team spends time on.`;
  return `Thanks for connecting, ${firstName(p.contactName)}.

We built PromiSure AI for ${angle(p)}. Before a campaign goes live, and while it runs, it checks advertised prices, discounts, stock, product claims, delivery promises and landing pages against the live store, and drafts corrected copy where something doesn't match.${hypothesis}

If useful, I'm happy to run a free check on one or two of your current campaigns. No obligation.`;
}

export function salesEmail(p: DraftProspect): { subject: string; body: string } {
  const subject = p.businessType?.startsWith("AGENCY") ? `Catching campaign/store mismatches for ${p.companyName}'s clients` : `Pre-launch checks for ${p.companyName}'s Shopify campaigns`;
  const hypothesis = p.problemHypothesis ? `\n\nMy hypothesis, which I'd like to test with you: ${p.problemHypothesis.replace(/\.$/, "")}.` : "";
  const body = `Hi ${firstName(p.contactName)},

I'm reaching out from NousGen. We've built PromiSure AI for ${angle(p)}.

It verifies each campaign against live Shopify facts before launch:
• advertised price and discount vs the live variant price
• stock and availability of the promoted variant
• product claims vs your approved product information
• delivery promises vs your shipping policies
• landing page and product handle

When something changes in the store, registered campaigns are re-checked automatically and a corrected draft is prepared for your review. Nothing is published or changed without your approval.${hypothesis}

Would a 20-minute call to run a check on one of ${p.companyName}'s current campaigns be useful?

Kind regards,
[Your name]
NousGen | PromiSure AI`;
  return { subject, body };
}

// ---------------------------------------------------------------------------
// LinkedIn search query generator (for manual searching only).
export interface QueryInput {
  roles: string[];
  industries: string[];
  locations: string[];
  /** Country to search when no specific locations are selected. Defaults to Australia. */
  country?: string;
  includeShopify: boolean;
}

export function buildBooleanQuery(q: QueryInput): string {
  const quote = (s: string) => (s.includes(" ") ? `"${s}"` : s);
  const parts: string[] = [];
  if (q.roles.length) parts.push(`(${q.roles.map(quote).join(" OR ")})`);
  if (q.industries.length) parts.push(`(${q.industries.map(quote).join(" OR ")})`);
  if (q.includeShopify) parts.push("Shopify");
  return parts.join(" AND ");
}

export function buildLinkedInSearchUrls(q: QueryInput): { location: string; query: string; url: string }[] {
  const query = buildBooleanQuery(q);
  const locs = q.locations.length ? q.locations : [q.country?.trim() || "Australia"];
  return locs.map((location) => {
    const keywords = `${query} ${location}`.trim();
    return { location, query: keywords, url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=GLOBAL_SEARCH_HEADER` };
  });
}
