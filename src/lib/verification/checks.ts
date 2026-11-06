import { Decimal, discountPercent, extractPercentOff, extractPrices, formatMoney, moneyEquals, toDecimal } from "@/lib/money";
import type {
  ClaimAnalysis,
  Finding,
  FindingType,
  Outcome,
  PolicyInput,
  Severity,
  VerificationInput,
} from "./types";

function f(
  input: VerificationInput,
  type: FindingType,
  code: string,
  severity: Severity,
  outcome: Outcome,
  originalClaim: string,
  verifiedInfo: string,
  sourceEvidence: string,
  recommendation: string,
): Finding {
  return {
    type,
    code,
    severity,
    outcome,
    originalClaim,
    verifiedInfo,
    sourceEvidence,
    recommendation,
    timestamp: input.now.toISOString(),
  };
}

const money = (v: string | Decimal | null | undefined, input: VerificationInput) => formatMoney(v ?? null, input.store.currency);

function variantEvidence(input: VerificationInput): string {
  const v = input.variant;
  const p = input.product;
  if (!v || !p) return "No Shopify variant linked";
  const synced = p.syncedAt ? ` (synced ${p.syncedAt.toISOString()})` : "";
  return `Shopify variant "${v.title}"${v.sku ? ` SKU ${v.sku}` : ""} of "${p.title}"${synced}`;
}

function activePromotionPolicy(input: VerificationInput): PolicyInput | undefined {
  return input.policies.find((p) => p.active && p.type === "PROMOTION");
}

// ---------------------------------------------------------------------------
// A. PRICE INTEGRITY
// ---------------------------------------------------------------------------
export function checkPrice(input: VerificationInput): Finding[] {
  const out: Finding[] = [];
  const { campaign, variant } = input;
  const copy = `${campaign.headline}\n${campaign.promoText}`;
  const advertised = toDecimal(campaign.advertisedPrice);

  if (!variant) {
    out.push(
      f(input, "PRICE", "PRICE_NO_VARIANT", "HIGH", "REVIEW", campaign.advertisedPrice ? `Advertised ${money(campaign.advertisedPrice, input)}` : "Campaign pricing",
        "No promoted variant selected, so the live price cannot be verified.", "Campaign record", "Select the exact Shopify variant being promoted."),
    );
    return out;
  }

  const live = toDecimal(variant.price)!;
  const compareAt = toDecimal(variant.compareAtPrice);

  if (!advertised) {
    out.push(
      f(input, "PRICE", "PRICE_NOT_ADVERTISED", "INFO", "PASS", "No advertised price", `Live price ${money(live, input)}`, variantEvidence(input),
        "No action needed. If the creative shows a price, enter it so it can be verified."),
    );
  } else if (moneyEquals(advertised, live)) {
    out.push(
      f(input, "PRICE", "PRICE_MATCH", "INFO", "PASS", `Advertised ${money(advertised, input)}`, `Live price ${money(live, input)}`, variantEvidence(input), "No action needed."),
    );
  } else {
    let verified = `Live Shopify price is ${money(live, input)}.`;
    let code = "PRICE_MISMATCH";
    const siblingMatch = input.siblingVariants.find((s) => s.id !== variant.id && moneyEquals(toDecimal(s.price)!, advertised));
    if (compareAt && moneyEquals(compareAt, advertised)) {
      code = "PRICE_OUTDATED";
      verified += ` The advertised amount equals the compare-at (previous) price ${money(compareAt, input)}, so the campaign appears to use an outdated price.`;
    } else if (siblingMatch) {
      code = "PRICE_WRONG_VARIANT";
      verified += ` The advertised amount matches variant "${siblingMatch.title}" (${money(siblingMatch.price, input)}); the wrong variant may be promoted.`;
    }
    const diff = advertised.minus(live);
    verified += ` Difference: ${diff.isNegative() ? "-" : "+"}${money(diff.abs(), input)}.`;
    out.push(
      f(input, "PRICE", code, "CRITICAL", "BLOCK", `Advertised ${money(advertised, input)}`, verified, variantEvidence(input),
        `Update the campaign to ${money(live, input)}, or change the Shopify price through your normal approval process before launch.`),
    );
  }

  // Sale-price / discount consistency.
  const claimedPercents = extractPercentOff(copy);
  const declaredPercent = campaign.discountType === "PERCENT" ? toDecimal(campaign.discountValue) : null;
  const percentsToCheck = [...claimedPercents];
  if (declaredPercent && !percentsToCheck.some((p) => p.equals(declaredPercent))) percentsToCheck.push(declaredPercent);

  const discountAdvertised = campaign.discountType !== "NONE" || percentsToCheck.length > 0;
  if (discountAdvertised) {
    if (!compareAt || compareAt.lte(live)) {
      out.push(
        f(input, "PRICE", "DISCOUNT_NO_REFERENCE", "HIGH", "BLOCK", describeDiscount(input, percentsToCheck),
          compareAt
            ? `Compare-at price ${money(compareAt, input)} is not higher than the live price ${money(live, input)}, so the store shows no discount.`
            : `No compare-at price is set on Shopify. The live price ${money(live, input)} is the full price.`,
          variantEvidence(input),
          "Remove the discount claim, or set up the promotion in Shopify (with a genuine reference price) before launch."),
      );
    } else {
      const actualPct = discountPercent(compareAt, live);
      for (const pct of percentsToCheck) {
        // Overstating is only tolerated within conventional rounding (claim − actual < 0.5 points):
        // "30% off" for 29.6% passes; "25% off" for 24.10% does not.
        const over = pct.minus(actualPct);
        if (over.gte(0.5)) {
          out.push(
            f(input, "PRICE", "DISCOUNT_MISMATCH", "HIGH", "BLOCK", `${pct.toString()}% off`,
              `Shopify pricing gives ${actualPct.toFixed(2)}% off (${money(compareAt, input)} → ${money(live, input)}). The campaign overstates the discount by ${over.toFixed(2)} points.`,
              variantEvidence(input), `Change the copy to "${actualPct.floor().toString()}% off" or correct the Shopify pricing.`),
          );
        } else if (over.lte(-5)) {
          // Understating is not misleading to customers, but usually means the copy is out of date.
          out.push(
            f(input, "PRICE", "DISCOUNT_UNDERSTATED", "LOW", "REVIEW", `${pct.toString()}% off`,
              `Shopify pricing now gives ${actualPct.toFixed(2)}% off (${money(compareAt, input)} → ${money(live, input)}). The copy may be out of date.`,
              variantEvidence(input), `Confirm the intended discount; consider "${actualPct.floor().toString()}% off".`),
          );
        } else {
          out.push(
            f(input, "PRICE", "DISCOUNT_ARITHMETIC_OK", "INFO", "PASS", `${pct.toString()}% off`,
              `Shopify pricing gives ${actualPct.toFixed(2)}% off (${money(compareAt, input)} → ${money(live, input)}).`, variantEvidence(input), "No action needed."),
          );
        }
      }
      if (campaign.discountType === "FIXED_AMOUNT") {
        const amt = toDecimal(campaign.discountValue);
        const actualAmt = compareAt.minus(live);
        if (!amt || !moneyEquals(amt, actualAmt)) {
          out.push(
            f(input, "PRICE", "DISCOUNT_MISMATCH", "HIGH", "BLOCK", `Save ${money(campaign.discountValue, input)}`,
              `Shopify pricing gives a saving of ${money(actualAmt, input)}.`, variantEvidence(input), `Change the saving to ${money(actualAmt, input)}.`),
          );
        }
      }
      // A compare-at price is a display value only. It does not prove the reference
      // price was genuinely charged, so it needs an approved promotion policy.
      const promo = activePromotionPolicy(input);
      if (!promo) {
        out.push(
          f(input, "PROMOTION", "REFERENCE_PRICE_UNSUBSTANTIATED", "MEDIUM", "REVIEW", describeDiscount(input, percentsToCheck),
            `The discount relies on a compare-at price of ${money(compareAt, input)}. A compare-at value alone does not show that this price was genuinely charged.`,
            "No approved promotion policy is configured for this store.",
            "Confirm that the reference price was genuinely offered, then record an approved promotion policy in Settings."),
        );
      }
    }
  }

  // Prices written into the copy that do not correspond to known store values.
  const known: Decimal[] = [live];
  if (compareAt) known.push(compareAt);
  for (const p of input.policies) {
    const t = toDecimal(p.freeShippingThreshold);
    if (t) known.push(t);
  }
  if (compareAt) known.push(compareAt.minus(live));
  for (const amount of extractPrices(copy)) {
    if (!known.some((k) => moneyEquals(k, amount)) && !(advertised && moneyEquals(advertised, amount))) {
      out.push(
        f(input, "PRICE", "COPY_PRICE_UNRECOGNISED", "HIGH", "BLOCK", `${money(amount, input)} in campaign copy`,
          `This amount does not match the live price (${money(live, input)})${compareAt ? `, compare-at price (${money(compareAt, input)})` : ""} or any configured shipping threshold.`,
          variantEvidence(input), `Replace it with the live price ${money(live, input)} or remove it.`),
      );
    }
    // An amount equal to a wrong advertised price is already reported as PRICE_MISMATCH.
  }
  return out;
}

function describeDiscount(input: VerificationInput, pcts: Decimal[]): string {
  const c = input.campaign;
  if (pcts.length) return pcts.map((p) => `${p.toString()}% off`).join(", ");
  if (c.discountType === "FIXED_AMOUNT") return `Save ${money(c.discountValue, input)}`;
  if (c.discountType === "COMPARE_AT") return "Was/now sale pricing";
  return "Discount claim";
}

// ---------------------------------------------------------------------------
// B. INVENTORY INTEGRITY
// ---------------------------------------------------------------------------
export function checkInventory(input: VerificationInput): Finding[] {
  const { variant } = input;
  if (!variant) return [];
  const ev = variantEvidence(input);
  const threshold = input.store.lowStockThreshold;
  const qty = variant.inventoryQuantity;
  const claim = "Promoted variant is available";

  if (!variant.availableForSale) {
    return [
      f(input, "INVENTORY", "VARIANT_UNAVAILABLE", "CRITICAL", "BLOCK", claim,
        `Shopify reports availableForSale = false${qty !== null ? ` (quantity ${qty})` : ""}.`, ev,
        "Pause the campaign or promote an available variant."),
    ];
  }
  if (!variant.inventoryTracked) {
    return [
      f(input, "INVENTORY", "INVENTORY_UNTRACKED", "LOW", "REVIEW", claim,
        "Inventory is not tracked for this variant, so stock levels cannot be verified.", ev,
        "Confirm stock manually, or enable inventory tracking in Shopify."),
    ];
  }
  if (qty === null) {
    return [
      f(input, "INVENTORY", "INVENTORY_UNKNOWN", "MEDIUM", "REVIEW", claim,
        "The inventory quantity was not accessible (check the read_inventory scope).", ev, "Grant inventory access or confirm stock manually."),
    ];
  }
  if (qty <= 0) {
    if (variant.inventoryPolicy === "CONTINUE") {
      return [
        f(input, "INVENTORY", "BACKORDER", "MEDIUM", "REVIEW", claim,
          `Quantity is ${qty}, but "continue selling when out of stock" is enabled, so customers can still order. Orders will be backordered.`, ev,
          "Make sure the campaign does not promise immediate dispatch, or wait for restock."),
      ];
    }
    return [
      f(input, "INVENTORY", "OUT_OF_STOCK", "CRITICAL", "BLOCK", claim, `Quantity is ${qty} and overselling is not allowed.`, ev,
        "Pause the campaign or promote an in-stock variant."),
    ];
  }
  if (qty < threshold) {
    return [
      f(input, "INVENTORY", "LOW_STOCK", "MEDIUM", "REVIEW", claim,
        `Only ${qty} units available (merchant threshold: ${threshold}).`, ev, "Confirm stock will cover expected campaign demand, or cap spend."),
    ];
  }
  return [f(input, "INVENTORY", "IN_STOCK", "INFO", "PASS", claim, `${qty} units available (threshold ${threshold}).`, ev, "No action needed.")];
}

// ---------------------------------------------------------------------------
// C. PRODUCT STATUS
// ---------------------------------------------------------------------------
export function checkProductStatus(input: VerificationInput): Finding[] {
  const { product } = input;
  if (!product) {
    return [
      f(input, "PRODUCT_STATUS", "NO_PRODUCT", "HIGH", "REVIEW", "Campaign product", "No Shopify product is linked to this campaign.",
        "Campaign record", "Link the campaign to the product it promotes."),
    ];
  }
  const ev = `Shopify product "${product.title}" (${product.handle})`;
  const out: Finding[] = [];
  if (product.status !== "ACTIVE") {
    out.push(
      f(input, "PRODUCT_STATUS", `PRODUCT_${product.status}`, "CRITICAL", "BLOCK", "Product is live", `Product status is ${product.status}.`, ev,
        "Activate the product in Shopify or stop the campaign."),
    );
  } else if (!product.publishedOnOnlineStore) {
    out.push(
      f(input, "PRODUCT_STATUS", "NOT_ON_ONLINE_STORE", "HIGH", "BLOCK", "Product is purchasable on the storefront",
        "The product is ACTIVE but not published to the Online Store sales channel (no online store URL).", ev,
        "Publish the product to the Online Store channel before driving traffic to it."),
    );
  } else {
    out.push(f(input, "PRODUCT_STATUS", "PRODUCT_ACTIVE", "INFO", "PASS", "Product is live", "Product is ACTIVE and published to the Online Store.", ev, "No action needed."));
  }
  return out;
}

// ---------------------------------------------------------------------------
// D. PROMOTION VALIDATION
// ---------------------------------------------------------------------------
export function checkPromotion(input: VerificationInput): Finding[] {
  const { campaign, now, product } = input;
  const out: Finding[] = [];
  const window = `${campaign.startsAt ? campaign.startsAt.toISOString().slice(0, 10) : "—"} to ${campaign.endsAt ? campaign.endsAt.toISOString().slice(0, 10) : "—"}`;

  if (campaign.startsAt && campaign.endsAt && campaign.startsAt > campaign.endsAt) {
    out.push(f(input, "PROMOTION", "INVALID_DATES", "HIGH", "BLOCK", `Campaign window ${window}`, "The start date is after the expiry date.", "Campaign record", "Correct the campaign dates."));
    return out;
  }
  // An offer has ended at its expiry instant (inclusive).
  if (campaign.endsAt && campaign.endsAt <= now) {
    out.push(
      f(input, "PROMOTION", "PROMOTION_EXPIRED", "CRITICAL", "BLOCK", `Offer valid ${window}`,
        `The offer expired on ${campaign.endsAt.toISOString()}. Current time: ${now.toISOString()}.`, "Campaign record (merchant-entered dates)",
        "Stop the campaign or remove the time-limited offer language."),
    );
  } else if (campaign.startsAt && campaign.startsAt > now) {
    out.push(f(input, "PROMOTION", "PROMOTION_SCHEDULED", "INFO", "PASS", `Offer valid ${window}`, "The offer has not started yet. Checks will re-run when it does.", "Campaign record", "No action needed."));
  } else if (campaign.endsAt) {
    const hours = (campaign.endsAt.getTime() - now.getTime()) / 3_600_000;
    out.push(
      f(input, "PROMOTION", hours < 48 ? "PROMOTION_ENDING_SOON" : "PROMOTION_ACTIVE", "INFO", "PASS", `Offer valid ${window}`,
        hours < 48 ? `The offer ends in ${hours.toFixed(1)} hours. Monitoring will flag it on expiry.` : "The offer is within its validity window.", "Campaign record", "No action needed."),
    );
  }

  const hasDiscount = campaign.discountType !== "NONE" || extractPercentOff(`${campaign.headline} ${campaign.promoText}`).length > 0;
  if (hasDiscount && !campaign.endsAt) {
    out.push(
      f(input, "PROMOTION", "PROMOTION_NO_EXPIRY", "LOW", "REVIEW", "Discount offer", "A discount is advertised without an expiry date.", "Campaign record",
        "Add an expiry date so monitoring can stop the offer on time."),
    );
  }

  // Merchant-configured promotion rules only; no rules are invented.
  const promo = activePromotionPolicy(input);
  if (promo && hasDiscount && input.variant) {
    const maxPct = toDecimal(promo.maxDiscountPercent);
    const live = toDecimal(input.variant.price)!;
    const compareAt = toDecimal(input.variant.compareAtPrice);
    const claimed = campaign.discountType === "PERCENT" ? toDecimal(campaign.discountValue) : compareAt && compareAt.gt(live) ? discountPercent(compareAt, live) : null;
    if (maxPct && claimed && claimed.gt(maxPct)) {
      out.push(
        f(input, "PROMOTION", "DISCOUNT_EXCEEDS_POLICY", "HIGH", "BLOCK", `${claimed.toString()}% discount`,
          `The approved promotion policy "${promo.name}" allows at most ${maxPct.toString()}%.`, `Merchant policy: ${promo.name}`,
          `Reduce the discount to ${maxPct.toString()}% or less, or get approval for an exception.`),
      );
    }
    const excluded = promo.regions.map((t) => t.toLowerCase()); // PROMOTION policies store excluded product tags in `regions`
    const hit = product?.tags.find((t) => excluded.includes(t.toLowerCase()));
    if (hit) {
      out.push(
        f(input, "PROMOTION", "PRODUCT_INELIGIBLE", "HIGH", "BLOCK", "Product included in promotion",
          `The product is tagged "${hit}", which the promotion policy "${promo.name}" excludes.`, `Merchant policy: ${promo.name}`, "Remove this product from the promotion."),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// E. PRODUCT CLAIMS (classification produced by the claim analyzer)
// ---------------------------------------------------------------------------
export function checkClaims(input: VerificationInput): Finding[] {
  const factText = (ids: string[]) =>
    ids.map((id) => input.facts.find((x) => x.id === id)).filter(Boolean).map((x) => `"${x!.statement}" [${x!.source}]`).join("; ");
  return input.claimAnalyses.map((a: ClaimAnalysis) => {
    if (a.classification === "SUPPORTED") {
      return f(input, "CLAIM", "CLAIM_SUPPORTED", "INFO", "PASS", a.claim, a.reason, `Approved facts: ${factText(a.supportingFactIds)} (analyzer: ${a.analyzer})`, "No action needed.");
    }
    if (a.classification === "CONTRADICTED") {
      return f(input, "CLAIM", "CLAIM_CONTRADICTED", "HIGH", "BLOCK", a.claim, a.reason,
        `Contradicting approved facts: ${factText(a.contradictingFactIds)} (analyzer: ${a.analyzer})`,
        a.suggestedRewrite ? `Replace with: "${a.suggestedRewrite}"` : "Remove or correct the claim.");
    }
    return f(input, "CLAIM", "CLAIM_UNVERIFIABLE", "MEDIUM", "REVIEW", a.claim, a.reason,
      `No approved product fact supports this claim (analyzer: ${a.analyzer})`,
      a.suggestedRewrite ? `Add an approved product fact as evidence, or replace with: "${a.suggestedRewrite}"` : "Add an approved product fact as evidence, or remove the claim.");
  });
}

// ---------------------------------------------------------------------------
// F. SHIPPING VALIDATION (merchant policies only; Shopify inventory is never used
//    to infer delivery dates)
// ---------------------------------------------------------------------------
export interface ParsedDeliveryPromise {
  maxDays: number | null;
  freeShipping: boolean;
  regions: string[];
  phrases: string[];
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14 };

export function parseDeliveryPromise(text: string): ParsedDeliveryPromise {
  const t = text.toLowerCase();
  const phrases: string[] = [];
  let maxDays: number | null = null;
  const setMax = (d: number, phrase: string) => {
    phrases.push(phrase);
    maxDays = maxDays === null ? d : Math.min(maxDays, d);
  };
  if (/same[- ]day/.test(t)) setMax(0, "same-day delivery");
  if (/next[- ]day|overnight|tomorrow/.test(t)) setMax(1, "next-day delivery");
  const range = /(\d+|one|two|three|four|five|six|seven|ten|fourteen)\s*(?:-|–|to)\s*(\d+|one|two|three|four|five|six|seven|ten|fourteen)\s*(?:business\s+|working\s+)?days?/g;
  let m: RegExpExecArray | null;
  while ((m = range.exec(t)) !== null) {
    const hi = Number.isNaN(Number(m[2])) ? WORD_NUMBERS[m[2]] : Number(m[2]);
    setMax(hi, m[0]);
  }
  const single = /(?:within|in|under|only)\s+(\d+|one|two|three|four|five|six|seven|ten|fourteen)\s*(?:business\s+|working\s+)?days?/g;
  while ((m = single.exec(t)) !== null) {
    const d = Number.isNaN(Number(m[1])) ? WORD_NUMBERS[m[1]] : Number(m[1]);
    setMax(d, m[0]);
  }
  const hours = /(?:within|in|under)\s+(\d+)\s*(?:hours|hrs|h)\b/g;
  while ((m = hours.exec(t)) !== null) setMax(Math.ceil(Number(m[1]) / 24), m[0]);

  const freeShipping = /free\s+(?:shipping|delivery|postage)/.test(t);
  const regions: string[] = [];
  if (/worldwide|international|global(?:ly)? shipping|ships? globally/.test(t)) regions.push("INTERNATIONAL");
  if (/australia[- ]wide|nationwide|anywhere in australia|all of australia/.test(t)) regions.push("AU_NATIONWIDE");
  if (/new zealand|\bnz\b/.test(t)) regions.push("NZ");
  return { maxDays, freeShipping, regions, phrases };
}

export function checkShipping(input: VerificationInput): Finding[] {
  const { campaign } = input;
  const text = [campaign.deliveryPromise, campaign.headline, campaign.promoText].filter(Boolean).join(". ");
  const parsed = parseDeliveryPromise(text);
  const out: Finding[] = [];
  const active = input.policies.filter((p) => p.active);
  const note = " Delivery estimates come from merchant policies. Shopify inventory data does not establish delivery dates.";

  if (parsed.maxDays === null && !parsed.freeShipping && parsed.regions.length === 0) {
    if (campaign.deliveryPromise.trim()) {
      out.push(
        f(input, "SHIPPING", "DELIVERY_CLAIM_UNPARSED", "LOW", "REVIEW", campaign.deliveryPromise,
          "The delivery promise could not be matched to a measurable timeframe.", "Merchant shipping policies", "Rephrase it to match an approved delivery estimate."),
      );
    }
    return out;
  }

  if (parsed.maxDays !== null) {
    const delivery = active.filter((p) => p.type === "DELIVERY" && p.minDays !== null);
    const claim = parsed.phrases.join(", ");
    if (delivery.length === 0) {
      out.push(f(input, "SHIPPING", "NO_DELIVERY_POLICY", "MEDIUM", "REVIEW", claim, "No approved delivery estimate is configured." + note, "Merchant shipping policies", "Add approved delivery estimates in Settings."));
    } else {
      const fastestMin = Math.min(...delivery.map((p) => p.minDays!));
      const covering = delivery.filter((p) => p.maxDays !== null && p.maxDays <= parsed.maxDays!);
      const evidence = delivery.map((p) => `${p.name}: ${p.minDays}–${p.maxDays ?? "?"} days`).join("; ");
      if (parsed.maxDays < fastestMin) {
        out.push(
          f(input, "SHIPPING", "DELIVERY_PROMISE_EXCEEDS_POLICY", "HIGH", "BLOCK", claim,
            `The fastest approved delivery estimate is ${fastestMin} days. The campaign promises ${parsed.maxDays === 0 ? "same day" : `${parsed.maxDays} day(s)`}.` + note,
            `Merchant policies: ${evidence}`, `Use an approved estimate, e.g. "${describePolicyWindow(delivery)}".`),
        );
      } else if (covering.length === 0) {
        out.push(
          f(input, "SHIPPING", "DELIVERY_PROMISE_PARTIAL", "MEDIUM", "REVIEW", claim,
            "Some deliveries may meet this timeframe, but no approved service guarantees it." + note, `Merchant policies: ${evidence}`,
            `Qualify the promise (e.g. "metro areas") or use "${describePolicyWindow(delivery)}".`),
        );
      } else {
        out.push(f(input, "SHIPPING", "DELIVERY_PROMISE_OK", "INFO", "PASS", claim, `Covered by approved policy "${covering[0].name}".` + note, `Merchant policies: ${evidence}`, "No action needed."));
      }
    }
  }

  if (parsed.freeShipping) {
    const freePolicies = active.filter((p) => p.freeShippingThreshold !== null);
    if (freePolicies.length === 0) {
      out.push(f(input, "SHIPPING", "FREE_SHIPPING_UNSUPPORTED", "HIGH", "BLOCK", "Free shipping", "No approved free-shipping policy is configured.", "Merchant shipping policies", "Remove the free shipping claim or configure the policy."));
    } else {
      const threshold = Decimal.min(...freePolicies.map((p) => toDecimal(p.freeShippingThreshold)!));
      const live = input.variant ? toDecimal(input.variant.price) : null;
      const mentionsCondition = /\bover\b|\bon orders\b|\bspend\b|\bmin(imum)?\b/i.test(text);
      if (threshold.gt(0) && live && live.lt(threshold) && !mentionsCondition) {
        out.push(
          f(input, "SHIPPING", "FREE_SHIPPING_CONDITION_MISSING", "MEDIUM", "REVIEW", "Free shipping",
            `Free shipping applies only to orders over ${money(threshold, input)}. This product costs ${money(live, input)}.`, `Merchant policy: ${freePolicies[0].name}`,
            `State the condition, e.g. "Free shipping on orders over ${money(threshold, input)}".`),
        );
      } else {
        out.push(f(input, "SHIPPING", "FREE_SHIPPING_OK", "INFO", "PASS", "Free shipping", threshold.gt(0) ? `Free shipping over ${money(threshold, input)}; the condition is met or stated.` : "Free shipping applies to all orders.", `Merchant policy: ${freePolicies[0].name}`, "No action needed."));
      }
    }
  }

  if (parsed.regions.length) {
    const geo = active.filter((p) => p.type === "GEOGRAPHY");
    const allowed = new Set(geo.flatMap((p) => p.regions.map((r) => r.toUpperCase())));
    const restrictions = active.filter((p) => p.type === "RESTRICTION");
    for (const region of parsed.regions) {
      if (geo.length === 0) {
        out.push(f(input, "SHIPPING", "NO_GEOGRAPHY_POLICY", "MEDIUM", "REVIEW", region, "No approved shipping geography is configured.", "Merchant shipping policies", "Configure the regions you ship to."));
      } else if (!allowed.has(region) && !(region === "AU_NATIONWIDE" && allowed.has("AU"))) {
        out.push(f(input, "SHIPPING", "REGION_NOT_SERVED", "HIGH", "BLOCK", region, `The approved shipping regions are: ${[...allowed].join(", ")}.`, `Merchant policies: ${geo.map((g) => g.name).join(", ")}`, "Remove the region claim."));
      } else if (region === "AU_NATIONWIDE" && restrictions.length) {
        out.push(f(input, "SHIPPING", "REGION_RESTRICTED", "LOW", "REVIEW", "Australia-wide delivery", `Approved restrictions apply: ${restrictions.map((r) => r.detail || r.name).join("; ")}.`, "Merchant restriction policies", "Add the restriction to the copy (e.g. \"excludes remote areas\")."));
      } else {
        out.push(f(input, "SHIPPING", "REGION_OK", "INFO", "PASS", region, "The region is covered by approved shipping geography.", `Merchant policies: ${geo.map((g) => g.name).join(", ")}`, "No action needed."));
      }
    }
  }
  return out;
}

function describePolicyWindow(delivery: PolicyInput[]): string {
  // Quote the most conservative approved service rather than merging services.
  const slowest = [...delivery].sort((a, b) => (b.maxDays ?? b.minDays!) - (a.maxDays ?? a.minDays!))[0];
  return `Delivery in ${slowest.minDays}–${slowest.maxDays ?? slowest.minDays} business days`;
}

// ---------------------------------------------------------------------------
// G. PRODUCT DESTINATION (result pre-fetched by the SSRF-safe fetcher)
// ---------------------------------------------------------------------------
export function checkDestination(input: VerificationInput): Finding[] {
  const d = input.destination;
  const url = input.campaign.productUrl;
  const sim = d?.simulated ? " (simulated: demo store)" : "";
  if (!url.trim()) {
    return [f(input, "DESTINATION", "NO_URL", "MEDIUM", "REVIEW", "Campaign destination", "No product URL was provided.", "Campaign record", "Add the landing page URL.")];
  }
  if (!d || d.status === "SKIPPED") {
    return [f(input, "DESTINATION", "DESTINATION_NOT_CHECKED", "LOW", "REVIEW", url, d?.message ?? "The destination was not checked.", "URL checker", "Re-run verification with URL checks enabled.")];
  }
  const chain = d.redirectChain.length ? ` Redirects: ${d.redirectChain.join(" → ")}.` : "";
  const ev = `HTTP ${d.httpStatus ?? "n/a"} from ${d.finalUrl ?? url}${chain}${sim}`;
  switch (d.status) {
    case "INVALID_URL":
    case "DISALLOWED":
      return [f(input, "DESTINATION", `URL_${d.status}`, "HIGH", "BLOCK", url, d.message, "URL safety policy", "Use an https URL on the merchant's own store domain.")];
    case "NOT_FOUND":
      return [f(input, "DESTINATION", "BROKEN_LINK", "CRITICAL", "BLOCK", url, `The destination returns ${d.httpStatus ?? 404}: ${d.message}`, ev, "Fix the link before launch.")];
    case "HTTP_ERROR":
    case "NETWORK_ERROR":
      return [f(input, "DESTINATION", "DESTINATION_UNREACHABLE", "MEDIUM", "REVIEW", url, d.message, ev, "Retry later or check the storefront manually.")];
  }
  const out: Finding[] = [];
  const expected = input.product?.handle;
  if (expected && d.resolvedHandle !== expected) {
    out.push(
      f(input, "DESTINATION", d.resolvedHandle ? "HANDLE_MISMATCH" : "NOT_A_PRODUCT_PAGE", "HIGH", "BLOCK", url,
        d.resolvedHandle ? `The page resolves to product "${d.resolvedHandle}", but the campaign promotes "${expected}".` : `The page does not resolve to a product page (expected /products/${expected}).`,
        ev, `Link directly to /products/${expected}.`),
    );
  } else {
    out.push(f(input, "DESTINATION", "DESTINATION_OK", "INFO", "PASS", url, `Resolves to the expected product page /products/${expected ?? d.resolvedHandle}.`, ev, "No action needed."));
  }
  return out;
}

export const ALL_CHECKS = [checkPrice, checkInventory, checkProductStatus, checkPromotion, checkClaims, checkShipping, checkDestination];
