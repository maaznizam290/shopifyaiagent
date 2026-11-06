/**
 * Regenerates the favicon files from the single logo definition in src/lib/brand.ts:
 *   public/icon.svg      – vector favicon
 *   src/app/favicon.ico  – 16/32/48 px PNG-in-ICO for browsers that request /favicon.ico
 * Usage: npm run icons
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { markSvg } from "../src/lib/brand";

async function main() {
  const root = path.resolve(__dirname, "..");
  const svg = markSvg();
  writeFileSync(path.join(root, "public", "icon.svg"), svg);

  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg), { density: 72 * (s / 32) * 4 }).resize(s, s).png().toBuffer()));

  // ICO container: 6-byte header, 16-byte directory entry per image, then PNG payloads.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] % 256, 0);
    e.writeUInt8(sizes[i] % 256, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  writeFileSync(path.join(root, "src", "app", "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
  console.log(`Wrote public/icon.svg and src/app/favicon.ico (${sizes.join(", ")} px).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
