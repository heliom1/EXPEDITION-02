// Builds the orbital (space) textures from NASA public-domain data in assets-src/nasa → public/assets/space/.
//   mars.jpg / phobos.jpg / deimos.jpg / stars.jpg / earth.jpg — NASA 3D Resources (github.com/nasa/NASA-3D-Resources),
//     equirectangular, longitude −180…180 (Mars colour mosaic from Viking MDIM data).
//   megt90n000cb.img — MGS MOLA MEGDR, 4 px/degree topography (PDS Geosciences Node), int16 big-endian metres,
//     longitude 0…360 °E → shifted 180° here to match the colour map.
// Outputs: mars_color.webp, mars_normal.png (tangent-space normal from MOLA, exaggerated for orbit view),
// mars_height.png (8-bit relief, used for terminator self-shadowing), phobos/deimos/earth.webp, stars.webp.
// Usage: node tools/build-space-textures.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets-src/nasa');
const out = join(root, 'public/assets/space');
mkdirSync(out, { recursive: true });

const W = 1440, H = 720;
const raw = readFileSync(join(src, 'megt90n000cb.img'));
const elev = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const sx = (x + W / 2) % W; // 0…360 °E → −180…180
  elev[y * W + x] = raw.readInt16BE((y * W + sx) * 2);
}
let mn = Infinity, mx = -Infinity;
for (const v of elev) { if (v < mn) mn = v; if (v > mx) mx = v; }

// Normal map: central differences on the sphere (metres per pixel shrink with cos(lat)).
const R = 3389500, mPerPx = (2 * Math.PI * R) / W, EXAG = 3.2;
const nrm = Buffer.alloc(W * H * 3);
const hgt = Buffer.alloc(W * H);
const at = (x, y) => elev[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)];
for (let y = 0; y < H; y++) {
  const lat = (0.5 - (y + 0.5) / H) * Math.PI;
  const dx = mPerPx * Math.max(0.05, Math.cos(lat));
  for (let x = 0; x < W; x++) {
    const gx = ((at(x + 1, y) - at(x - 1, y)) / (2 * dx)) * EXAG;
    const gy = ((at(x, y - 1) - at(x, y + 1)) / (2 * mPerPx)) * EXAG;
    let nx = -gx, ny = -gy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * W + x) * 3;
    nrm[i] = Math.round((nx * 0.5 + 0.5) * 255);
    nrm[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    nrm[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    hgt[y * W + x] = Math.round(((elev[y * W + x] - mn) / (mx - mn)) * 255);
  }
}
await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(out, 'mars_normal.png'));
await sharp(hgt, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(join(out, 'mars_height.png'));
// Colour: upscale to 2048 with mild sharpening so the globe holds up in close orbit shots (detail beyond that is shader noise).
await sharp(join(src, 'mars.jpg')).resize(2048, 1024, { kernel: 'lanczos3' }).sharpen({ sigma: 0.8 }).webp({ quality: 90 }).toFile(join(out, 'mars_color.webp'));
await sharp(join(src, 'phobos.jpg')).resize(1024, 512).webp({ quality: 85 }).toFile(join(out, 'phobos.webp'));
await sharp(join(src, 'deimos.jpg')).resize(1024, 512).webp({ quality: 85 }).toFile(join(out, 'deimos.webp'));
await sharp(join(src, 'earth.jpg')).resize(1024, 512).webp({ quality: 85 }).toFile(join(out, 'earth.webp'));
// Star map: darken the sky background so only stars + Milky Way remain; kept at full 2880×1440.
await sharp(join(src, 'stars.jpg')).linear(1.15, -12).webp({ quality: 88 }).toFile(join(out, 'stars.webp'));
console.log(`MOLA range ${mn} … ${mx} m; wrote ${out}`);
