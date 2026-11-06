// Pure domain types for the verification engine. The engine never touches the
// database or network: callers assemble a VerificationInput and the engine
// returns findings. This keeps every check deterministic and unit-testable.

export type Outcome = "PASS" | "REVIEW" | "BLOCK";
export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FindingType =
  | "PRICE"
  | "INVENTORY"
  | "PRODUCT_STATUS"
  | "PROMOTION"
  | "CLAIM"
  | "SHIPPING"
  | "DESTINATION";

export type ClaimClassification = "SUPPORTED" | "CONTRADICTED" | "UNVERIFIABLE";

export interface Finding {
  type: FindingType;
  code: string;
  severity: Severity;
  outcome: Outcome;
  originalClaim: string;
  verifiedInfo: string;
  sourceEvidence: string;
  recommendation: string;
  timestamp: string;
}

export interface CampaignInput {
  name: string;
  channel: string;
  productUrl: string;
  headline: string;
  promoText: string;
  advertisedPrice: string | null;
  discountType: "NONE" | "PERCENT" | "FIXED_AMOUNT" | "COMPARE_AT";
  discountValue: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  claims: string[];
  deliveryPromise: string;
  status: string;
}

export interface ProductInput {
  id: string;
  title: string;
  handle: string;
  status: string; // ACTIVE | DRAFT | ARCHIVED | UNLISTED
  publishedOnOnlineStore: boolean;
  onlineStoreUrl: string | null;
  tags: string[];
  syncedAt: Date | null;
}

export interface VariantInput {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryTracked: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: string; // DENY | CONTINUE
  availableForSale: boolean;
}

export interface FactInput {
  id: string;
  category: string;
  statement: string;
  source: string;
  verificationStatus: string; // VERIFIED | MERCHANT_ENTERED | UNVERIFIED | AI_SUGGESTION
  approved: boolean;
}

export interface PolicyInput {
  id: string;
  type: string; // DISPATCH | DELIVERY | SHIPPING_SERVICE | GEOGRAPHY | RESTRICTION | PROMOTION
  name: string;
  minDays: number | null;
  maxDays: number | null;
  regions: string[];
  freeShippingThreshold: string | null;
  maxDiscountPercent: string | null;
  detail: string;
  active: boolean;
}

export interface StoreInput {
  shopDomain: string;
  publicDomain: string | null;
  lowStockThreshold: number;
  currency: string;
}

export type DestinationStatus =
  | "OK"
  | "NOT_FOUND"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "DISALLOWED"
  | "INVALID_URL"
  | "SKIPPED";

export interface DestinationResult {
  status: DestinationStatus;
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  redirectChain: string[];
  resolvedHandle: string | null;
  simulated: boolean;
  message: string;
}

export interface ClaimAnalysis {
  claim: string;
  classification: ClaimClassification;
  reason: string;
  supportingFactIds: string[];
  contradictingFactIds: string[];
  suggestedRewrite: string | null;
  analyzer: string; // "rules" | "ollama:<model>" | "anthropic:<model>"
}

export interface VerificationInput {
  now: Date;
  campaign: CampaignInput;
  product: ProductInput | null;
  variant: VariantInput | null;
  siblingVariants: VariantInput[];
  facts: FactInput[];
  policies: PolicyInput[];
  store: StoreInput;
  destination: DestinationResult | null;
  claimAnalyses: ClaimAnalysis[];
}

export interface VerificationResult {
  riskStatus: Outcome;
  riskScore: number;
  scoreBreakdown: { code: string; severity: Severity; points: number }[];
  findings: Finding[];
  summary: string;
}
