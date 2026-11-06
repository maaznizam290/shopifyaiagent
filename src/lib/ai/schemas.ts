import { z } from "zod/v4";

export const ClaimAnalysisItemSchema = z.object({
  claim: z.string(),
  classification: z.enum(["SUPPORTED", "CONTRADICTED", "UNVERIFIABLE"]),
  reason: z.string(),
  supportingFactIds: z.array(z.string()),
  contradictingFactIds: z.array(z.string()),
  suggestedRewrite: z.string().nullable(),
});

export const ClaimAnalysisResponseSchema = z.object({
  claims: z.array(ClaimAnalysisItemSchema),
});

export const CorrectedCopySchema = z.object({
  headline: z.string().max(200),
  marketingText: z.string().max(2000),
  productDescription: z.string().max(2000),
  cta: z.string().max(60),
  explanation: z.string().max(2000),
});

export type ClaimAnalysisResponse = z.infer<typeof ClaimAnalysisResponseSchema>;
export type CorrectedCopy = z.infer<typeof CorrectedCopySchema> & { generator: string; guardNotes: string[] };
