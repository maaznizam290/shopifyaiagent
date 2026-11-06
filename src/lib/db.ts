import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function audit(params: { storeId?: string | null; actor?: string; action: string; entity: string; entityId?: string | null; detail?: unknown }) {
  await prisma.auditLog.create({
    data: {
      storeId: params.storeId ?? null,
      actor: params.actor ?? "system",
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      detailJson: JSON.stringify(params.detail ?? {}),
    },
  });
}
