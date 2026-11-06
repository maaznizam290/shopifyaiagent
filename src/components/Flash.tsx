import { Notice } from "./ui";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !error) return null;
  return (
    <div className="mb-5 space-y-2">
      {ok && <Notice tone="success">{ok}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
