import dns from "node:dns/promises";
import net from "node:net";
import type { DestinationResult } from "./types";

// Server-side URL verification with SSRF protection:
//  - http(s) only, default ports, no embedded credentials
//  - host must be one of the merchant's own domains
//  - every resolved IP must be public (no loopback, private, link-local, CGNAT, metadata)
//  - redirects followed manually (max 5), each hop re-validated
//  - short timeout, HEAD first, small GET fallback, body never read beyond headers

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

export function validateDestinationUrl(raw: string, allowedHosts: string[]): { ok: true; url: URL } | { ok: false; status: "INVALID_URL" | "DISALLOWED"; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: "INVALID_URL", message: "The URL is not valid." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, status: "INVALID_URL", message: "Only http(s) URLs are allowed." };
  if (url.username || url.password) return { ok: false, status: "DISALLOWED", message: "URLs with embedded credentials are not allowed." };
  if (url.port && url.port !== "443" && url.port !== "80") return { ok: false, status: "DISALLOWED", message: "Non-standard ports are not allowed." };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (net.isIP(host)) return { ok: false, status: "DISALLOWED", message: "IP-address URLs are not allowed." };
  const allowed = allowedHosts.map((h) => h.toLowerCase());
  const permitted = allowed.some((h) => host === h || host === `www.${h}` || (h.startsWith("www.") && host === h.slice(4)));
  if (!permitted) return { ok: false, status: "DISALLOWED", message: `Host "${host}" is not one of the merchant's domains (${allowed.join(", ")}).` };
  return { ok: true, url };
}

export function handleFromPath(pathname: string): string | null {
  const m = pathname.match(/\/products\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

export async function checkDestinationLive(raw: string, allowedHosts: string[], opts: { timeoutMs?: number; resolver?: (h: string) => Promise<string[]> } = {}): Promise<DestinationResult> {
  const base: DestinationResult = { status: "OK", requestedUrl: raw, finalUrl: null, httpStatus: null, redirectChain: [], resolvedHandle: null, simulated: false, message: "" };
  const resolve = opts.resolver ?? (async (h: string) => (await dns.lookup(h, { all: true })).map((r) => r.address));
  let current = raw;
  for (let hop = 0; hop <= 5; hop++) {
    const v = validateDestinationUrl(current, allowedHosts);
    if (!v.ok) return { ...base, status: v.status, finalUrl: current, message: v.message };
    try {
      const ips = await resolve(v.url.hostname);
      if (!ips.length || ips.some(isPrivateIp)) return { ...base, status: "DISALLOWED", finalUrl: current, message: "The host resolves to a private or reserved address." };
    } catch {
      return { ...base, status: "NETWORK_ERROR", finalUrl: current, message: "DNS resolution failed." };
    }
    let res: Response;
    try {
      res = await fetch(v.url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 8000), headers: { "user-agent": "PromiSureAI-LinkCheck/1.0" } });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(v.url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 8000), headers: { "user-agent": "PromiSureAI-LinkCheck/1.0", range: "bytes=0-0" } });
        await res.body?.cancel();
      }
    } catch (e) {
      return { ...base, status: "NETWORK_ERROR", finalUrl: current, message: `Request failed: ${(e as Error).message}` };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location")!, v.url).toString();
      base.redirectChain.push(next);
      current = next;
      continue;
    }
    const finalUrl = v.url.toString();
    const resolvedHandle = handleFromPath(v.url.pathname);
    if (res.status === 404 || res.status === 410) return { ...base, status: "NOT_FOUND", httpStatus: res.status, finalUrl, resolvedHandle, message: "Page not found." };
    if (res.status >= 400) return { ...base, status: "HTTP_ERROR", httpStatus: res.status, finalUrl, resolvedHandle, message: `HTTP ${res.status}.` };
    return { ...base, status: "OK", httpStatus: res.status, finalUrl, resolvedHandle, message: "Reachable." };
  }
  return { ...base, status: "HTTP_ERROR", finalUrl: current, message: "Too many redirects." };
}

/**
 * Demo stores are fictional, so their URLs are resolved against the local catalogue
 * the same way Shopify's storefront would respond: active + published handles → 200,
 * everything else → 404. Results are clearly flagged as simulated.
 */
export function checkDestinationSimulated(
  raw: string,
  allowedHosts: string[],
  catalogue: { handle: string; status: string; published: boolean }[],
  redirects: Record<string, string> = {},
): DestinationResult {
  const base: DestinationResult = { status: "OK", requestedUrl: raw, finalUrl: raw, httpStatus: null, redirectChain: [], resolvedHandle: null, simulated: true, message: "" };
  const v = validateDestinationUrl(raw, allowedHosts);
  if (!v.ok) return { ...base, status: v.status, message: v.message };
  let handle = handleFromPath(v.url.pathname);
  let finalUrl = v.url.toString();
  if (handle && redirects[handle]) {
    handle = redirects[handle];
    finalUrl = `${v.url.origin}/products/${handle}`;
    base.redirectChain.push(finalUrl);
  }
  if (!handle) return { ...base, status: "OK", httpStatus: 200, finalUrl, resolvedHandle: null, message: "Reachable, but not a product page." };
  const p = catalogue.find((c) => c.handle === handle);
  if (!p || p.status !== "ACTIVE" || !p.published) return { ...base, status: "NOT_FOUND", httpStatus: 404, finalUrl, resolvedHandle: handle, message: "Product page not found on storefront." };
  return { ...base, status: "OK", httpStatus: 200, finalUrl, resolvedHandle: handle, message: "Reachable." };
}
