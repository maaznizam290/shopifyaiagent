import { audit, prisma } from "@/lib/db";
import { connectionNote, followUpMessage, salesEmail } from "./outreach";
import { ProspectInputSchema, scoreProspect, type ProspectInput } from "./scoring";

function clean(data: ProspectInput) {
  return {
    ...data,
    website: data.website || null,
    linkedinUrl: data.linkedinUrl || null,
    email: data.email || null,
  };
}

export async function createProspect(raw: unknown, actor = "user") {
  const data = clean(ProspectInputSchema.parse(raw));
  const s = scoreProspect(data);
  const p = await prisma.prospect.create({ data: { ...data, leadScore: s.score, scoreBreakdownJson: JSON.stringify(s.breakdown) } });
  await prisma.prospectActivity.create({ data: { prospectId: p.id, type: "NOTE", detail: "Prospect created (manual entry)" } });
  await audit({ actor, action: "PROSPECT_CREATED", entity: "Prospect", entityId: p.id, detail: { company: p.companyName, score: s.score } });
  return p;
}

export async function updateProspect(id: string, raw: unknown, actor = "user") {
  const data = clean(ProspectInputSchema.parse(raw));
  const s = scoreProspect(data);
  const p = await prisma.prospect.update({ where: { id }, data: { ...data, leadScore: s.score, scoreBreakdownJson: JSON.stringify(s.breakdown) } });
  await audit({ actor, action: "PROSPECT_UPDATED", entity: "Prospect", entityId: id, detail: { score: s.score } });
  return p;
}

export async function generateDrafts(prospectId: string, actor = "user") {
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const email = salesEmail(p);
  await prisma.outreachDraft.createMany({
    data: [
      { prospectId, kind: "CONNECTION_NOTE", body: connectionNote(p) },
      { prospectId, kind: "FOLLOW_UP", body: followUpMessage(p) },
      { prospectId, kind: "EMAIL", subject: email.subject, body: email.body },
    ],
  });
  if (p.outreachStatus === "NEW" || p.outreachStatus === "RESEARCHING") {
    await prisma.prospect.update({ where: { id: prospectId }, data: { outreachStatus: "DRAFTED" } });
  }
  await audit({ actor, action: "OUTREACH_DRAFTS_GENERATED", entity: "Prospect", entityId: prospectId });
}

/** Records an interaction the user performed manually (PromiSure AI never sends messages). */
export async function recordActivity(prospectId: string, type: string, detail: string, actor = "user") {
  await prisma.prospectActivity.create({ data: { prospectId, type, detail } });
  const statusFor: Record<string, string> = { CONNECTION_SENT: "MESSAGED", MESSAGE_SENT: "MESSAGED", EMAIL_SENT: "MESSAGED", REPLY: "REPLIED", MEETING: "MEETING", PILOT_OFFER: "PILOT", CUSTOMER: "CUSTOMER" };
  const order = ["NEW", "RESEARCHING", "DRAFTED", "MESSAGED", "REPLIED", "MEETING", "PILOT", "CUSTOMER"];
  const next = statusFor[type];
  if (next) {
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
    if (order.indexOf(next) > order.indexOf(p.outreachStatus)) await prisma.prospect.update({ where: { id: prospectId }, data: { outreachStatus: next } });
  }
  await audit({ actor, action: `PROSPECT_ACTIVITY_${type}`, entity: "Prospect", entityId: prospectId, detail: { detail } });
}
