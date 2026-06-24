// Generates all CeloSave static image assets using only Node.js built-ins.
// Run: node scripts/gen-assets.mjs
import { deflateSync, crc32 } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'packages', 'app', 'public');
mkdirSync(OUT, { recursive: true });

// ── Brand colours ────────────────────────────────────────────────────────────
const GREEN = [7, 149, 95];      // #07955F
const WHITE = [255, 255, 255];
const GOLD  = [251, 204, 92];    // #FBCC5C
const BG    = [240, 249, 244];   // very light green background for OG

// ── PNG builder ──────────────────────────────────────────────────────────────
function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcVal = crc32(Buffer.concat([typeB, data]));
  const crcB = Buffer.alloc(4);
  // crc32 returns signed int32; treat as uint32
  crcB.writeUInt32BE(crcVal >>> 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

function makePNG(width, height, drawFn) {
  // RGB pixels
  const pixels = new Uint8Array(width * height * 3);
  drawFn(pixels, width, height);

  // Add None filter byte per row
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 3;
      const ri = y * (width * 3 + 1) + 1 + x * 3;
      raw[ri] = pixels[pi];
      raw[ri + 1] = pixels[pi + 1];
      raw[ri + 2] = pixels[pi + 2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB
  // compression, filter, interlace all 0

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function setPixel(pixels, width, x, y, rgb) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= pixels.length / 3 / width) return;
  const i = (y * width + x) * 3;
  pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2];
}

function fillCircle(pixels, width, height, cx, cy, r, rgb) {
  for (let y = Math.max(0, cy - r - 1); y <= Math.min(height - 1, cy + r + 1); y++) {
    for (let x = Math.max(0, cx - r - 1); x <= Math.min(width - 1, cx + r + 1); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r ** 2) {
        setPixel(pixels, width, x, y, rgb);
      }
    }
  }
}

// Anti-aliased line (Wu's algorithm simplified)
function drawLine(pixels, width, height, x0, y0, x1, y1, rgb, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let dy = -thickness; dy <= thickness; dy++) {
      for (let dx = -thickness; dx <= thickness; dx++) {
        if (dx * dx + dy * dy <= thickness * thickness) {
          setPixel(pixels, width, Math.round(x + dx), Math.round(y + dy), rgb);
        }
      }
    }
  }
}

function fillRect(pixels, width, x, y, w, h, rgb) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      setPixel(pixels, width, px, py, rgb);
    }
  }
}

// ── Logo draw function (square canvas, 0–1 coords scaled to size) ─────────────
function drawLogo(pixels, W, H) {
  const s = W / 36; // scale factor (logo designed on 36x36 grid)

  // Background: white
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255;
  }

  // Green circle
  fillCircle(pixels, W, H, W / 2, H / 2, W / 2 - 1, GREEN);

  // Trend line: M9 25 L14 19 L18 22 L25 13 (on 36x36 grid)
  const pts = [[9, 25], [14, 19], [18, 22], [25, 13]];
  const t = Math.max(1, Math.round(s * 1.3));
  for (let i = 0; i < pts.length - 1; i++) {
    drawLine(
      pixels, W, H,
      pts[i][0] * s, pts[i][1] * s,
      pts[i + 1][0] * s, pts[i + 1][1] * s,
      WHITE, t
    );
  }

  // Gold dot at (25, 13)
  fillCircle(pixels, W, H, Math.round(25 * s), Math.round(13 * s), Math.round(2.5 * s), GOLD);
}

// ── OG image (1200 × 630) ─────────────────────────────────────────────────────
function drawOG(pixels, W, H) {
  // White background
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255;
  }

  // Green top bar (top 40% of image)
  fillRect(pixels, W, 0, 0, W, Math.round(H * 0.45), GREEN);

  // Logo mark centred in the green area
  const logoR = Math.round(H * 0.16);
  const cx = Math.round(W * 0.15);
  const cy = Math.round(H * 0.22);
  const s = (logoR * 2) / 36;

  fillCircle(pixels, W, H, cx, cy, logoR, [255, 255, 255]);

  // Draw logo inside the white circle
  const pts = [[9, 25], [14, 19], [18, 22], [25, 13]];
  const t = Math.max(2, Math.round(s * 1.3));
  for (let i = 0; i < pts.length - 1; i++) {
    drawLine(
      pixels, W, H,
      cx - logoR + pts[i][0] * s, cy - logoR + pts[i][1] * s,
      cx - logoR + pts[i + 1][0] * s, cy - logoR + pts[i + 1][1] * s,
      GREEN, t
    );
  }
  fillCircle(
    pixels, W, H,
    Math.round(cx - logoR + 25 * s), Math.round(cy - logoR + 13 * s),
    Math.round(2.5 * s), GOLD
  );

  // Green bottom accent strip
  fillRect(pixels, W, 0, H - 8, W, 8, GREEN);

  // Side green accent bar
  fillRect(pixels, W, 0, 0, 8, H, GREEN);
}

// ── Generate ──────────────────────────────────────────────────────────────────
const logo512 = makePNG(512, 512, drawLogo);
writeFileSync(join(OUT, 'logo.png'), logo512);
console.log('✓ logo.png (512×512)');

const apple180 = makePNG(180, 180, drawLogo);
writeFileSync(join(OUT, 'apple-touch-icon.png'), apple180);
console.log('✓ apple-touch-icon.png (180×180)');

const og = makePNG(1200, 630, drawOG);
writeFileSync(join(OUT, 'og-image.png'), og);
console.log('✓ og-image.png (1200×630)');

// favicon.ico — ICO wrapping a 32×32 PNG
const fav32 = makePNG(32, 32, drawLogo);
// ICO header (single image, PNG data embedded)
const ico = Buffer.alloc(6 + 16 + fav32.length);
ico.writeUInt16LE(0, 0);        // reserved
ico.writeUInt16LE(1, 2);        // type: ICO
ico.writeUInt16LE(1, 4);        // image count
// Image directory entry
ico[6] = 32;                    // width  (0 = 256 when ≥256)
ico[7] = 32;                    // height
ico[8] = 0;                     // color count
ico[9] = 0;                     // reserved
ico.writeUInt16LE(1, 10);       // planes
ico.writeUInt16LE(32, 12);      // bit count
ico.writeUInt32LE(fav32.length, 14); // bytes in image
ico.writeUInt32LE(22, 18);      // offset to image data
fav32.copy(ico, 22);
writeFileSync(join(OUT, 'favicon.ico'), ico);
console.log('✓ favicon.ico (32×32 PNG-in-ICO)');

console.log('\nAll assets written to packages/app/public/');
