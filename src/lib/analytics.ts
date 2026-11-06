import { prisma } from "@/lib/db";
import { QUALIFIED_THRESHOLD } from "@/lib/sales/scoring";

/** Campaign analytics from each campaign's latest verification. Demo and real data are counted separately. */
export async function campaignAnalytics(storeId: string) {
  const campaigns = await prisma.campaign.findMany({ where: { storeId }, include: { checks: { orderBy: { createdAt: "desc" }, take: 1, include: { findings: true } } } });
  const checked = campaigns.filter((c) => c.checks.length);
  const latestFindings = checked.flatMap((c) => c.checks[0].findings.filter((f) => f.outcome !== "PASS"));
  const has = (pred: (code: string, type: string) => boolean) => checked.filter((c) => c.checks[0].findings.some((f) => f.outcome !== "PASS" && pred(f.code, f.type))).length;
  const totalChecks = await prisma.campaignCheck.count({ where: { campaign: { storeId } } });
  return {
    isDemo: campaigns.some((c) => c.isDemo),
    total: campaigns.length,
    checked: checked.length,
    totalChecks,
    pass: checked.filter((c) => c.riskStatus === "PASS").length,
    review: checked.filter((c) => c.riskStatus === "REVIEW").length,
    block: checked.filter((c) => c.riskStatus === "BLOCK").length,
    discrepancies: {
      price: has((code, type) => type === "PRICE"),
      inventory: has((_c, type) => type === "INVENTORY"),
      claims: has((_c, type) => type === "CLAIM"),
      expired: has((code) => code === "PROMOTION_EXPIRED"),
      brokenLinks: has((code) => ["BROKEN_LINK", "HANDLE_MISMATCH", "NOT_A_PRODUCT_PAGE"].includes(code)),
      shipping: has((_c, type) => type === "SHIPPING"),
    },
    findingsByType: Object.entries(
      latestFindings.reduce<Record<string, number>>((acc, f) => ((acc[f.type] = (acc[f.type] ?? 0) + 1), acc), {}),
    ).sort((a, b) => b[1] - a[1]),
  };
}

export async function salesAnalytics() {
  const prospects = await prisma.prospect.findMany({ include: { activities: true, drafts: true } });
  const split = (demo: boolean) => {
    const ps = prospects.filter((p) => p.isDemo === demo);
    const acts = ps.flatMap((p) => p.activities);
    const count = (t: string[]) => acts.filter((a) => t.includes(a.type)).length;
    return {
      total: ps.length,
      qualified: ps.filter((p) => p.leadScore >= QUALIFIED_THRESHOLD).length,
      drafts: ps.reduce((s, p) => s + p.drafts.length, 0),
      messages: count(["CONNECTION_SENT", "MESSAGE_SENT", "EMAIL_SENT"]),
      replies: count(["REPLY"]),
      meetings: count(["MEETING"]),
      pilots: count(["PILOT_OFFER"]),
      customers: ps.filter((p) => p.outreachStatus === "CUSTOMER").length,
    };
  };
  return { actual: split(false), demo: split(true) };
}
