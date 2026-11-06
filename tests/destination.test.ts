import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDestinationLive, checkDestinationSimulated, isPrivateIp, validateDestinationUrl } from "@/lib/verification/destination";

const HOSTS = ["shop.test.example", "test.myshopify.com"];

describe("11b. Destination checks and SSRF protection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects non-merchant domains, IPs, credentials, ports and non-http schemes", () => {
    expect(validateDestinationUrl("https://evil.example/products/x", HOSTS).ok).toBe(false);
    expect(validateDestinationUrl("http://127.0.0.1/products/x", HOSTS).ok).toBe(false);
    expect(validateDestinationUrl("https://user:pw@shop.test.example/", HOSTS).ok).toBe(false);
    expect(validateDestinationUrl("https://shop.test.example:8080/", HOSTS).ok).toBe(false);
    expect(validateDestinationUrl("file:///etc/passwd", HOSTS).ok).toBe(false);
    expect(validateDestinationUrl("https://shop.test.example/products/x", HOSTS).ok).toBe(true);
  });

  it("identifies private and reserved addresses", () => {
    for (const ip of ["10.0.0.1", "192.168.1.1", "172.20.0.1", "169.254.169.254", "127.0.0.1", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp("23.227.38.65")).toBe(false);
  });

  it("refuses hosts that resolve to private IPs (DNS rebinding)", async () => {
    const r = await checkDestinationLive("https://shop.test.example/products/x", HOSTS, { resolver: async () => ["10.1.2.3"] });
    expect(r.status).toBe("DISALLOWED");
  });

  it("follows redirects manually and re-validates each hop", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://evil.example/steal" } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkDestinationLive("https://shop.test.example/products/x", HOSTS, { resolver: async () => ["23.227.38.65"] });
    expect(r.status).toBe("DISALLOWED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports 404s and resolves the product handle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const r = await checkDestinationLive("https://shop.test.example/products/missing", HOSTS, { resolver: async () => ["23.227.38.65"] });
    expect(r.status).toBe("NOT_FOUND");
    expect(r.resolvedHandle).toBe("missing");
  });

  it("simulates demo storefront responses", () => {
    const cat = [{ handle: "a", status: "ACTIVE", published: true }, { handle: "b", status: "ARCHIVED", published: false }];
    expect(checkDestinationSimulated("https://shop.test.example/products/a", HOSTS, cat).status).toBe("OK");
    expect(checkDestinationSimulated("https://shop.test.example/products/b", HOSTS, cat).status).toBe("NOT_FOUND");
    const red = checkDestinationSimulated("https://shop.test.example/products/b", HOSTS, cat, { b: "a" });
    expect(red.resolvedHandle).toBe("a");
    expect(red.simulated).toBe(true);
  });
});
