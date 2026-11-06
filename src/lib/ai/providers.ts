import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { ClaimAnalysis, FactInput, PolicyInput } from "@/lib/verification/types";
import { analyzeClaimWithRules, eligibleFacts } from "./claimRules";
import { ClaimAnalysisResponseSchema, CorrectedCopySchema } from "./schemas";

export type ProviderId = "rules" | "ollama" | "anthropic";

export interface ClaimAnalysisRequest {
  claims: string[];
  campaignText: string;
  productTitle: string;
  facts: FactInput[];
  policies: PolicyInput[];
}

export interface CopyRequest {
  campaignText: { headline: string; promoText: string };
  productTitle: string;
  livePrice: string | null;
  compareAtPrice: string | null;
  facts: FactInput[];
  policies: PolicyInput[];
  findings: { code: string; outcome: string; originalClaim: string; verifiedInfo: string; recommendation: string }[];
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  analyzeClaims(req: ClaimAnalysisRequest): Promise<ClaimAnalysis[]>;
  generateCopy(req: CopyRequest): Promise<z.infer<typeof CorrectedCopySchema> | null>;
}

const SYSTEM = `You are the claim-verification component of PromiSure AI, a campaign integrity tool for Shopify merchants.
You compare marketing claims against APPROVED PRODUCT FACTS and MERCHANT POLICIES supplied by the application.
Rules:
- SUPPORTED only when one or more approved facts directly establish the claim. Cite their ids in supportingFactIds.
- CONTRADICTED when an approved fact conflicts with the claim (e.g. "waterproof" vs "water-resistant"). Cite ids in contradictingFactIds.
- UNVERIFIABLE when the facts neither establish nor contradict the claim. Plausibility is not evidence.
- suggestedRewrite must only use information found in the approved facts; otherwise null.
- Never invent product facts, prices, discounts, delivery times or certifications.`;

function factsBlock(facts: FactInput[]): string {
  return eligibleFacts(facts).map((f) => `- [${f.id}] (${f.category}) ${f.statement}`).join("\n") || "(none)";
}
function policiesBlock(policies: PolicyInput[]): string {
  return policies.filter((p) => p.active).map((p) => `- ${p.type} "${p.name}": ${p.minDays ?? "?"}-${p.maxDays ?? "?"} days; regions ${p.regions.join(",") || "-"}; ${p.detail}`).join("\n") || "(none)";
}

function claimPrompt(req: ClaimAnalysisRequest): string {
  return `PRODUCT: ${req.productTitle}
CAMPAIGN TEXT:
${req.campaignText}

APPROVED PRODUCT FACTS:
${factsBlock(req.facts)}

MERCHANT POLICIES:
${policiesBlock(req.policies)}

Classify each of these claims (return them in the same order, with the claim text unchanged):
${req.claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
}

function copyPrompt(req: CopyRequest): string {
  return `Rewrite this campaign so every statement is grounded in the verified data below.
PRODUCT: ${req.productTitle}
LIVE PRICE: ${req.livePrice ?? "unknown"}  COMPARE-AT PRICE: ${req.compareAtPrice ?? "none"}
ORIGINAL HEADLINE: ${req.campaignText.headline}
ORIGINAL TEXT: ${req.campaignText.promoText}

APPROVED PRODUCT FACTS:
${factsBlock(req.facts)}

MERCHANT POLICIES:
${policiesBlock(req.policies)}

VERIFICATION FINDINGS TO RESOLVE:
${req.findings.filter((f) => f.outcome !== "PASS").map((f) => `- ${f.code}: claim "${f.originalClaim}" | verified: ${f.verifiedInfo} | fix: ${f.recommendation}`).join("\n") || "(none)"}

Only mention prices equal to the live price or compare-at price. Remove anything unverifiable. Keep the brand voice, concise and in Australian English.`;
}

// ---------------------------------------------------------------------------
export const rulesProvider: AIProvider = {
  id: "rules",
  label: "Deterministic rules (no AI)",
  async analyzeClaims(req) {
    return req.claims.map((c) => analyzeClaimWithRules(c, req.facts));
  },
  async generateCopy() {
    return null; // caller falls back to the template generator
  },
};

// ---------------------------------------------------------------------------
export function ollamaProvider(baseUrl: string, model: string): AIProvider {
  async function chat<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: z.toJSONSchema(schema),
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return schema.parse(JSON.parse(data.message?.content ?? ""));
  }
  return {
    id: "ollama",
    label: `Ollama (${model})`,
    async analyzeClaims(req) {
      const out = await chat(claimPrompt(req), ClaimAnalysisResponseSchema);
      return out.claims.map((c) => ({ ...c, analyzer: `ollama:${model}` }));
    },
    async generateCopy(req) {
      return chat(copyPrompt(req), CorrectedCopySchema);
    },
  };
}

// ---------------------------------------------------------------------------
export function anthropicProvider(apiKey: string, model: string): AIProvider {
  const client = new Anthropic({ apiKey });
  async function call<T extends z.ZodType>(prompt: string, schema: T): Promise<z.infer<T>> {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      // Server-side refusal fallback: routes a declined request to a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new Error("Model declined the request");
    if (!response.parsed_output) throw new Error("Model output failed schema validation");
    return schema.parse(response.parsed_output);
  }
  return {
    id: "anthropic",
    label: `Anthropic (${model})`,
    async analyzeClaims(req) {
      const out = await call(claimPrompt(req), ClaimAnalysisResponseSchema);
      return out.claims.map((c) => ({ ...c, analyzer: `anthropic:${model}` }));
    },
    async generateCopy(req) {
      return call(copyPrompt(req), CorrectedCopySchema);
    },
  };
}

export function resolveProvider(preferred?: string | null): AIProvider {
  const id = (preferred || process.env.AI_PROVIDER || "rules").toLowerCase();
  if (id === "ollama") return ollamaProvider(process.env.OLLAMA_BASE_URL || "http://localhost:11434", process.env.OLLAMA_MODEL || "llama3.1:8b");
  if (id === "anthropic" && process.env.ANTHROPIC_API_KEY) return anthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || "claude-opus-5-5");
  return rulesProvider;
}

/**
 * Merges AI analysis with deterministic rules.
 * - A rule-detected contradiction always stands.
 * - AI "SUPPORTED"/"CONTRADICTED" verdicts must cite approved fact ids that exist; otherwise they are downgraded to UNVERIFIABLE.
 */
export function mergeClaimAnalyses(rules: ClaimAnalysis[], ai: ClaimAnalysis[] | null, facts: FactInput[]): ClaimAnalysis[] {
  if (!ai) return rules;
  const valid = new Set(eligibleFacts(facts).map((f) => f.id));
  return rules.map((r, i) => {
    const a = ai.find((x) => x.claim.trim().toLowerCase() === r.claim.trim().toLowerCase()) ?? ai[i];
    if (!a) return r;
    if (r.classification === "CONTRADICTED") return { ...r, analyzer: `rules+${a.analyzer}` };
    const sup = a.supportingFactIds.filter((id) => valid.has(id));
    const con = a.contradictingFactIds.filter((id) => valid.has(id));
    if (a.classification === "SUPPORTED" && sup.length === 0) {
      return { ...r, classification: "UNVERIFIABLE", reason: `${r.reason} (AI suggested support but cited no approved fact.)`, analyzer: `rules+${a.analyzer}` };
    }
    if (a.classification === "CONTRADICTED" && con.length === 0) {
      return { ...r, classification: "UNVERIFIABLE", reason: `AI flagged a possible contradiction without citing an approved fact: ${a.reason}`, analyzer: `rules+${a.analyzer}` };
    }
    return { ...a, claim: r.claim, supportingFactIds: sup, contradictingFactIds: con };
  });
}
