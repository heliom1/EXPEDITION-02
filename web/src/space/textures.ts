import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Small canvas-generated surface textures for the procedural spacecraft (no external assets). */
const rnd = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed = 7, color = true): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, rnd(seed));
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  if (color) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Off-white hull panels with seams, rivet rows, faint grime and stencil marks. */
export const hullTexture = () => tex(1024, 1024, (g, r) => {
  g.fillStyle = '#e9e6df'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) { // grime / sheen variation
    g.fillStyle = `rgba(${120 + r() * 60},${110 + r() * 50},${100 + r() * 40},${r() * 0.05})`;
    g.fillRect(r() * 1024, r() * 1024, 4 + r() * 60, 4 + r() * 60);
  }
  g.strokeStyle = 'rgba(70,70,70,0.55)'; g.lineWidth = 2;
  for (let y = 0; y <= 1024; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  for (let y = 0; y < 1024; y += 128) for (let x = (y / 128) % 2 ? 64 : 0; x <= 1024; x += 128 + Math.floor(r() * 2) * 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 128); g.stroke(); }
  g.fillStyle = 'rgba(60,60,60,0.5)';
  for (let y = 6; y < 1024; y += 128) for (let x = 4; x < 1024; x += 12) g.fillRect(x, y, 2, 2);
  g.fillStyle = 'rgba(30,30,30,0.7)'; g.font = 'bold 30px monospace';
  g.fillText('EXPEDITION 02', 300, 470); g.font = '18px monospace'; g.fillText('NO STEP', 80, 860); g.fillText('RCS ▲', 820, 220);
  g.fillStyle = '#b5341f'; g.fillRect(300, 480, 230, 6);
}, 11);

/** Gold multi-layer insulation (MLI): crinkled foil highlights. */
export const foilTexture = () => tex(512, 512, (g, r) => {
  const grd = g.createLinearGradient(0, 0, 512, 512); grd.addColorStop(0, '#b8862c'); grd.addColorStop(0.5, '#e8c15a'); grd.addColorStop(1, '#a8761f');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = r() * 512, y = r() * 512, l = 8 + r() * 40, a = r() * Math.PI;
    g.strokeStyle = r() > 0.5 ? `rgba(255,240,180,${0.15 + r() * 0.35})` : `rgba(90,55,10,${0.15 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.strokeStyle = 'rgba(80,50,10,0.6)'; g.lineWidth = 3;
  for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
}, 23);

/** Solar array: dark blue cells in a silver grid. */
export const solarTexture = () => tex(512, 1024, (g, r) => {
  g.fillStyle = '#c9ccd2'; g.fillRect(0, 0, 512, 1024);
  for (let y = 0; y < 1024; y += 32) for (let x = 0; x < 512; x += 32) {
    const v = 22 + r() * 14;
    g.fillStyle = `rgb(${v * 0.55},${v * 0.75},${v * 2.4 + 20})`; g.fillRect(x + 2, y + 2, 28, 28);
    g.fillStyle = 'rgba(160,180,255,0.08)'; g.fillRect(x + 2, y + 2, 28, 3);
  }
}, 31);

/** Ablative heat shield: dark mottled tiles (PICA-like) with a honeycomb seam pattern. */
export const shieldTexture = () => tex(1024, 1024, (g, r) => {
  g.fillStyle = '#3b2a20'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${40 + r() * 50},${25 + r() * 30},${15 + r() * 20},${0.3 + r() * 0.5})`; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 8, 2 + r() * 8); }
  g.strokeStyle = 'rgba(15,10,8,0.8)'; g.lineWidth = 2;
  const s = 48;
  for (let row = 0; row < 26; row++) for (let col = 0; col < 14; col++) {
    const cx = col * s * 1.5, cy = row * s * 0.866 + (col % 2 ? s * 0.433 : 0);
    g.beginPath();
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2; g.lineTo(cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5); }
    g.stroke();
  }
}, 47);

/** Parachute gores: alternating international orange / white panels. */
export const chuteTexture = () => tex(1024, 256, (g) => {
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f4efe6' : '#e2551d'; g.fillRect(i * 64, 0, 64, 256); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 1024, 2);
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 1024, 26);
}, 3);

/** Thruster / plume noise used by the additive plume shader (greyscale). */
export const noiseTexture = () => tex(256, 256, (g, r) => {
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = r() * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  g.filter = 'blur(2px)'; g.drawImage(g.canvas, 0, 0);
}, 59, false);
