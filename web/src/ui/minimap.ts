/**
 * Map rendering from the CinderRain survey map (north-up hillshade, 2048 px over the world square).
 * Shared by the HUD minimap (heading-up, local) and the PDA map (north-up, whole world).
 */
export interface MapMarker { x: number; z: number; label: string; kind: 'objective' | 'site' }

export class SurveyMap {
  constructor(readonly image: HTMLImageElement, readonly extent: number) {}

  static load(url: string, extent: number): Promise<SurveyMap> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(new SurveyMap(img, extent));
      img.onerror = () => rej(new Error(`failed to load ${url}`));
      img.src = url;
    });
  }

  /** World (x, z) → map image pixel. */
  toPx(x: number, z: number): [number, number] {
    const s = this.image.width / (2 * this.extent);
    return [(x + this.extent) * s, (this.extent - z) * s];
  }

  /** Heading-up circular minimap around the player. */
  drawMini(ctx: CanvasRenderingContext2D, px: number, pz: number, headingDeg: number, markers: MapMarker[], radiusM = 320): void {
    const W = ctx.canvas.width, c = W / 2;
    const metresPerPx = (2 * this.extent) / this.image.width;
    const scale = c / (radiusM / metresPerPx); // canvas px per map px
    const rot = (-headingDeg * Math.PI) / 180;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#2a170f'; ctx.fillRect(0, 0, W, W);
    ctx.translate(c, c);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    const [mx, my] = this.toPx(px, pz);
    ctx.filter = 'brightness(1.45) contrast(1.1)';
    ctx.drawImage(this.image, -mx, -my);
    ctx.filter = 'none';
    ctx.restore();

    // Range rings.
    ctx.strokeStyle = 'rgba(255,236,220,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, c * 0.5, 0, Math.PI * 2); ctx.stroke();

    for (const m of markers) {
      const dx = m.x - px, dz = m.z - pz;
      // Rotate world delta into heading-up screen space.
      const h = (headingDeg * Math.PI) / 180;
      const sx = dx * Math.cos(h) - dz * Math.sin(h);
      const sy = -(dx * Math.sin(h) + dz * Math.cos(h));
      let ux = (sx / radiusM) * c, uy = (sy / radiusM) * c;
      const r = Math.hypot(ux, uy), maxR = c - 9;
      const clamped = r > maxR;
      if (clamped) { ux *= maxR / r; uy *= maxR / r; }
      ctx.save();
      ctx.translate(c + ux, c + uy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = m.kind === 'objective' ? '#f2a03d' : 'rgba(127,216,255,0.9)';
      ctx.strokeStyle = '#1b0d05';
      const s = m.kind === 'objective' ? 7 : 5;
      ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    // Player arrow (always pointing up).
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = '#7fd8ff'; ctx.strokeStyle = '#061018'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // North indicator on the rim.
    const nAng = rot - Math.PI / 2;
    ctx.fillStyle = '#fff'; ctx.font = '600 11px Bahnschrift, Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', c + Math.cos(nAng) * (c - 9), c + Math.sin(nAng) * (c - 9));
  }

  /** North-up full map for the PDA. */
  drawFull(ctx: CanvasRenderingContext2D, px: number, pz: number, headingDeg: number, markers: MapMarker[]): void {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const s = Math.min(W, H) / this.image.width;
    const ox = (W - this.image.width * s) / 2, oy = (H - this.image.height * s) / 2;
    ctx.fillStyle = '#120d0b'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.image, ox, oy, this.image.width * s, this.image.height * s);
    ctx.strokeStyle = 'rgba(255,236,220,0.08)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 6; k++) {
      const t = (k / 6) * this.image.width * s;
      ctx.beginPath(); ctx.moveTo(ox + t, oy); ctx.lineTo(ox + t, oy + this.image.height * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + t); ctx.lineTo(ox + this.image.width * s, oy + t); ctx.stroke();
    }
    ctx.font = '600 24px Bahnschrift, Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const m of markers) {
      const [mx, my] = this.toPx(m.x, m.z);
      const x = ox + mx * s, y = oy + my * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = m.kind === 'objective' ? '#f2a03d' : '#7fd8ff'; ctx.strokeStyle = '#1b0d05';
      const sz = m.kind === 'objective' ? 20 : 14;
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText(m.label, x + 18, y);
      ctx.shadowBlur = 0;
    }
    const [ppx, ppy] = this.toPx(px, pz);
    ctx.save(); ctx.translate(ox + ppx * s, oy + ppy * s); ctx.rotate((headingDeg * Math.PI) / 180);
    ctx.fillStyle = '#7fd8ff'; ctx.strokeStyle = '#061018'; ctx.lineWidth = 1.5;
    ctx.scale(2, 2); ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
