import { NextResponse } from "next/server";
import { parseJson, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Machine-readable verification report (for future n8n / integrations). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const k = await prisma.campaignCheck.findUnique({ where: { id }, include: { findings: true, campaign: { select: { id: true, name: true, channel: true, isDemo: true } } } });
  if (!k) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: k.id, createdAt: k.createdAt, trigger: k.trigger, riskStatus: k.riskStatus, riskScore: k.riskScore, summary: k.summary, aiProvider: k.aiProvider,
    campaign: k.campaign, demoData: k.campaign.isDemo, snapshot: parseJson(k.factsSnapshotJson, {}),
    findings: k.findings.map(({ checkId: _c, ...f }) => f),
  });
}
