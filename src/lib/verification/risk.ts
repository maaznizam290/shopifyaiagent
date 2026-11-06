import type { Finding, Outcome, Severity, VerificationResult } from "./types";

// Transparent risk score: points for every non-passing finding, capped at 100.
// The score is informational. The status comes from the findings themselves, so
// a low score can never turn a BLOCK into a PASS.
export const SEVERITY_POINTS: Record<Severity, number> = {
  INFO: 0,
  LOW: 5,
  MEDIUM: 12,
  HIGH: 25,
  CRITICAL: 40,
};

export function classify(findings: Finding[]): Outcome {
  if (findings.some((f) => f.outcome === "BLOCK")) return "BLOCK";
  if (findings.some((f) => f.outcome === "REVIEW")) return "REVIEW";
  return "PASS";
}

export function scoreFindings(findings: Finding[]) {
  const breakdown = findings
    .filter((f) => f.outcome !== "PASS")
    .map((f) => ({ code: f.code, severity: f.severity, points: SEVERITY_POINTS[f.severity] }));
  const total = Math.min(100, breakdown.reduce((s, b) => s + b.points, 0));
  return { total, breakdown };
}

export function buildResult(findings: Finding[]): VerificationResult {
  const riskStatus = classify(findings);
  const { total, breakdown } = scoreFindings(findings);
  const blocks = findings.filter((f) => f.outcome === "BLOCK").length;
  const reviews = findings.filter((f) => f.outcome === "REVIEW").length;
  const passes = findings.filter((f) => f.outcome === "PASS").length;
  const summary =
    riskStatus === "BLOCK"
      ? `${blocks} blocking issue${blocks === 1 ? "" : "s"}, ${reviews} item${reviews === 1 ? "" : "s"} needing review.`
      : riskStatus === "REVIEW"
        ? `No blocking issues. ${reviews} item${reviews === 1 ? "" : "s"} need${reviews === 1 ? "s" : ""} human review.`
        : `All ${passes} checks passed.`;
  return { riskStatus, riskScore: total, scoreBreakdown: breakdown, findings, summary };
}
