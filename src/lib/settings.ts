import { prisma } from "@/lib/db";

export const SETTING_KEYS = {
  aiProvider: "ai.provider", // rules | ollama | anthropic
  checkUrls: "verify.checkUrls", // "true" | "false"
  activeStoreId: "store.activeId",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/** The store currently shown in the UI: the explicitly selected one, else the first live store, else the demo store. */
export async function getActiveStore() {
  const id = await getSetting(SETTING_KEYS.activeStoreId);
  if (id) {
    const s = await prisma.merchantStore.findUnique({ where: { id } });
    if (s) return s;
  }
  return (await prisma.merchantStore.findFirst({ where: { isDemo: false } })) ?? (await prisma.merchantStore.findFirst({ orderBy: { createdAt: "asc" } }));
}

export function aiStatus() {
  return {
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.1:8b",
  };
}
