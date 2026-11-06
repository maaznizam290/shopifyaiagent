import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { COUNTRIES } from "@/lib/countries";
import { buildLinkedInSearchUrls, connectionNote, followUpMessage, salesEmail } from "@/lib/sales/outreach";
import { csvRowToProspect, parseCsv, ProspectInputSchema, scoreProspect } from "@/lib/sales/scoring";
import { createProspect } from "@/lib/sales/service";

afterAll(() => prisma.$disconnect());

describe("14. Prospect creation", () => {
  it("validates input and persists a scored prospect", async () => {
    const p = await createProspect({ companyName: "Test Agency", jobTitle: "Founder", location: "Sydney", country: "Australia", businessType: "AGENCY_MARKETING", shopifyVerified: true, shopifyEvidence: "Partner listing" }, "test");
    const saved = await prisma.prospect.findUniqueOrThrow({ where: { id: p.id }, include: { activities: true } });
    expect(saved.leadScore).toBeGreaterThan(0);
    expect(saved.activities.length).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: "Prospect", entityId: p.id } })).toBe(1);
  });
  it("rejects invalid input", () => {
    expect(ProspectInputSchema.safeParse({ companyName: "" }).success).toBe(false);
    expect(ProspectInputSchema.safeParse({ companyName: "X", linkedinUrl: "https://evil.example/in/x" }).success).toBe(false);
  });
  it("imports CSV rows with quoted fields", () => {
    const rows = parseCsv('Company,Contact Name,Job Title,Location,Shopify Verified\n"Acme, Pty Ltd",Jo Bloggs,CEO,"Melbourne, VIC",yes\n');
    expect(rows).toHaveLength(1);
    const r = csvRowToProspect(rows[0]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.companyName).toBe("Acme, Pty Ltd");
      expect(r.data.shopifyVerified).toBe(true);
    }
  });
});

describe("15. Lead qualification", () => {
  it("scores decision-makers at verified Australian Shopify businesses as qualified", () => {
    const s = scoreProspect({ companyName: "A", businessType: "DTC_BRAND", industry: "Fashion", location: "Sydney", country: "Australia", shopifyVerified: true, jobTitle: "Head of E-commerce", website: "https://a.example" });
    expect(s.score).toBeGreaterThanOrEqual(60);
    expect(s.qualified).toBe(true);
    expect(s.breakdown.map((b) => b.factor)).toContain("Shopify usage verified");
  });
  it("gives unknown information zero points (no invented signals)", () => {
    const s = scoreProspect({ companyName: "Unknown Co" });
    expect(s.score).toBe(0);
    expect(s.qualified).toBe(false);
  });
  it("weights unverified Shopify evidence lower than verified", () => {
    const a = scoreProspect({ companyName: "A", shopifyEvidence: "maybe" }).score;
    const b = scoreProspect({ companyName: "A", shopifyEvidence: "maybe", shopifyVerified: true }).score;
    expect(b).toBeGreaterThan(a);
  });
});

describe("Outreach copilot drafts", () => {
  const p = { companyName: "Acme", contactName: "Jo Bloggs", jobTitle: "Founder", businessType: "DTC_BRAND", location: "Sydney, NSW" };
  it("keeps LinkedIn connection notes within 300 characters", () => {
    expect(connectionNote(p).length).toBeLessThanOrEqual(300);
    expect(connectionNote({ ...p, companyName: "A".repeat(200) }).length).toBeLessThanOrEqual(300);
  });
  it("does not invent company-specific problems", () => {
    expect(followUpMessage(p)).not.toMatch(/hypothesis|guess/i);
    expect(salesEmail(p).body).not.toMatch(/hypothesis/i);
    expect(followUpMessage({ ...p, problemHypothesis: "Prices drift between ads and store" })).toContain("Prices drift between ads and store");
  });
  it("generates manual LinkedIn search links only", () => {
    const urls = buildLinkedInSearchUrls({ roles: ["Founder", "Head of E-commerce"], industries: ["Fashion"], locations: ["Sydney"], includeShopify: true });
    expect(urls[0].url).toMatch(/^https:\/\/www\.linkedin\.com\/search\/results\/people\/\?keywords=/);
    expect(urls[0].query).toContain('"Head of E-commerce"');
  });
  it("searches the selected country when no cities are chosen", () => {
    const urls = buildLinkedInSearchUrls({ roles: ["Founder"], industries: [], locations: [], country: "United Kingdom", includeShopify: true });
    expect(urls).toHaveLength(1);
    expect(urls[0].location).toBe("United Kingdom");
    expect(urls[0].query).toBe("(Founder) AND Shopify United Kingdom");
    expect(buildLinkedInSearchUrls({ roles: ["Founder"], industries: [], locations: [], includeShopify: false })[0].location).toBe("Australia");
  });
  it("offers every country in the location dropdown", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(195);
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    for (const c of ["Australia", "United States", "United Kingdom", "India", "Pakistan", "Germany", "Brazil", "Japan"]) expect(COUNTRIES).toContain(c);
  });
});

describe("Prospect CSV template", () => {
  it("every column in public/prospects-template.csv is understood by the importer", async () => {
    const { readFileSync } = await import("node:fs");
    const headers = readFileSync("public/prospects-template.csv", "utf8").trim().split(",");
    const sample: Record<string, string> = { "Shopify Verified": "yes", Employees: "12", "Business Type": "DTC brand", Website: "https://acme.example", "LinkedIn URL": "https://www.linkedin.com/in/acme", Email: "jo@acme.example" };
    const row = Object.fromEntries(headers.map((h) => [h, sample[h] ?? `Acme ${h}`]));
    const r = csvRowToProspect(row);
    expect(r.ok ? "ok" : r.error).toBe("ok");
    if (r.ok) expect(Object.values(r.data).filter((v) => v !== undefined && v !== "").length).toBeGreaterThanOrEqual(headers.length);
  });
});
