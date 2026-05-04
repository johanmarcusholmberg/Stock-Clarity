// Generates a simple placeholder favicon: a #38BEEB square with a white
// trend-line drawn across it. Run: node scripts/generateFavicon.mjs
// Replace assets/images/favicon.png with the real brand favicon when ready.
//
// Uses zlib (node built-in) to write a valid 32x32 PNG by hand — no extra
// deps, no canvas. The trend line is rasterised from a 4-segment polyline.

import { writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT = resolve(__dirname, "..", "assets", "images", "favicon.png");

const SIZE = 32;
const BG = [0x38, 0xbe, 0xeb, 0xff]; // primary
const FG = [0xff, 0xff, 0xff, 0xff]; // wordmark white

// Pixel buffer (RGBA)
const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * 4;
    pixels[o + 0] = BG[0];
    pixels[o + 1] = BG[1];
    pixels[o + 2] = BG[2];
    pixels[o + 3] = BG[3];
  }
}

// Trend line: (5,22) → (12,16) → (20,18) → (27,9)
const segments = [
  [5, 22, 12, 16],
  [12, 16, 20, 18],
  [20, 18, 27, 9],
];
function plot(x, y) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const o = (y * SIZE + x) * 4;
  pixels[o + 0] = FG[0];
  pixels[o + 1] = FG[1];
  pixels[o + 2] = FG[2];
  pixels[o + 3] = FG[3];
}
function drawLine(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    plot(x0, y0);
    plot(x0 + 1, y0); // 2px stroke
    plot(x0, y0 + 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}
for (const [x0, y0, x1, y1] of segments) drawLine(x0, y0, x1, y1);

// Build PNG (IHDR + IDAT + IEND)
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = u32(data.length);
  const crc = u32(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.concat([
  u32(SIZE),
  u32(SIZE),
  Buffer.from([8, 6, 0, 0, 0]), // 8-bit, RGBA, no interlace
]);
// Add filter byte (0) at the start of each scanline
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0;
  pixels.subarray(y * SIZE * 4, (y + 1) * SIZE * 4).forEach((v, i) => {
    raw[y * (1 + SIZE * 4) + 1 + i] = v;
  });
}
const idat = deflateSync(raw);

const png = Buffer.concat([
  SIG,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

if (existsSync(OUT)) {
  console.log(`favicon.png already exists at ${OUT} — skipping (delete to regenerate).`);
} else {
  writeFileSync(OUT, png);
  console.log(`Wrote placeholder favicon to ${OUT} (${png.length} bytes)`);
}
