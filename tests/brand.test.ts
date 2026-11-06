import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BRAND_NAME, markSvg } from "@/lib/brand";

const root = path.resolve(__dirname, "..");

describe("Brand mark", () => {
  it("public/icon.svg is generated from the same definition as the in-app logo", () => {
    expect(readFileSync(path.join(root, "public", "icon.svg"), "utf8")).toBe(markSvg());
  });

  it("favicon.ico contains the same mark (pixel-identical to a fresh render)", async () => {
    const ico = readFileSync(path.join(root, "src", "app", "favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // icon type
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const size = ico.readUInt8(entry);
      const png = ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
      const fresh = await sharp(Buffer.from(markSvg()), { density: 72 * (size / 32) * 4 }).resize(size, size).raw().toBuffer();
      const stored = await sharp(png).raw().toBuffer();
      expect(stored.equals(fresh)).toBe(true);
    }
  });

  it("uses the product name without the NousGen byline", () => {
    expect(BRAND_NAME).toBe("PromiSure AI");
  });
});
