// Contact sheet: node tools/contact-sheet.mjs out.png cols img1 img2 ...  (each tile 533x300, labelled)
import sharp from 'sharp';
const [out, colsS, ...imgs] = process.argv.slice(2);
const cols = +colsS, W = 533, H = 300, rows = Math.ceil(imgs.length / cols);
const tiles = await Promise.all(imgs.map(async (f, i) => {
  const label = Buffer.from(`<svg width="${W}" height="22"><rect width="100%" height="100%" fill="black" opacity="0.6"/><text x="6" y="16" font-size="14" fill="white" font-family="monospace">${f.split(/[\/]/).pop()}</text></svg>`);
  const buf = await sharp(f).resize(W, H).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
  return { input: buf, left: (i % cols) * W, top: Math.floor(i / cols) * H };
}));
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#000' } }).composite(tiles).png().toFile(out);
console.log(out);
