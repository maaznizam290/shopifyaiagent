import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runMonitoringCycle } from "@/lib/monitoring/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** External-cron trigger. Requires `Authorization: Bearer $CRON_SECRET`; disabled when CRON_SECRET is unset. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Endpoint disabled (set CRON_SECRET)" }, { status: 404 });
  const auth = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(auth);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await runMonitoringCycle("SCHEDULED");
  return NextResponse.json(summary);
}
