import { ALL_CHECKS } from "./checks";
import { buildResult } from "./risk";
import type { VerificationInput, VerificationResult } from "./types";

/** Runs every deterministic check. Pure: no I/O. */
export function verifyCampaign(input: VerificationInput): VerificationResult {
  const findings = ALL_CHECKS.flatMap((check) => check(input));
  return buildResult(findings);
}
