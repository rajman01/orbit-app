// Generates PWA icons from the Orbit mark. Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const accent = "#0E7C8F";
const mark = (bg, pad) => {
  const s = 512;
  const r = (s / 2 - pad) * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="${bg}"/>
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="#fff" stroke-width="${r * 0.28}"/>
  <circle cx="${256 + r * 0.8}" cy="${256 - r * 0.72}" r="${r * 0.38}" fill="#fff" stroke="${bg}" stroke-width="${r * 0.18}"/>
</svg>`;
};

mkdirSync("public/icons", { recursive: true });
const full = Buffer.from(mark(accent, 40));
const maskable = Buffer.from(mark(accent, 110)); // keeps the mark inside the 80% safe zone

await sharp(full).resize(192).png().toFile("public/icons/icon-192.png");
await sharp(full).resize(512).png().toFile("public/icons/icon-512.png");
await sharp(maskable).resize(512).png().toFile("public/icons/maskable-512.png");
await sharp(full).resize(180).png().toFile("public/icons/apple-touch-icon.png");
await sharp(full).resize(48).png().toFile("public/icons/icon-48.png");
console.log("icons written to public/icons");
