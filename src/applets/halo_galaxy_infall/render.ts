import { HaloGalaxyInfallSnapshot } from "./types";

export type RenderOptions = {
  showWakeOverlay: boolean;
  showVelocityVectors: boolean;
  showComTrail: boolean;
};

function toPixel(
  centerPx: { x: number; y: number },
  posKpc: { x: number; y: number },
  kpcPerPixel: number
): { x: number; y: number } {
  return {
    x: centerPx.x + posKpc.x / kpcPerPixel,
    y: centerPx.y - posKpc.y / kpcPerPixel
  };
}

function formatKpcLabel(kpc: number): string {
  if (kpc >= 100) {
    return kpc.toFixed(0);
  }
  if (kpc >= 10) {
    return kpc.toFixed(1);
  }
  return kpc.toFixed(2);
}

function wakeColor(delta: number): string {
  const d = Math.max(-2, Math.min(2, delta));
  if (d >= 0) {
    const t = d / 2;
    const r = Math.round(180 + 75 * t);
    const g = Math.round(200 - 80 * t);
    const b = Math.round(220 - 200 * t);
    const a = 0.35 + 0.45 * t;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }
  const t = -d / 2;
  const r = Math.round(180 - 90 * t);
  const g = Math.round(200 - 60 * t);
  const b = Math.round(220 + 25 * t);
  const a = 0.35 + 0.25 * t;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function particleRadius(massMsun: number): number {
  const logM = Math.log10(Math.max(massMsun, 1e3));
  return 1.2 + Math.max(0, logM - 4) * 0.85;
}

export function renderHaloGalaxyInfall(
  ctx: CanvasRenderingContext2D,
  snapshot: HaloGalaxyInfallSnapshot,
  opts: RenderOptions
): void {
  const { width, height, centerPx, kpcPerPixel, particles, hostDerived, comTrailPx } = snapshot;
  const rVirKpc = Math.max(hostDerived.rVirKpc, 1e-6);
  const rsKpc = hostDerived.rsKpc;

  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#040714");
  bg.addColorStop(0.45, "#0a1124");
  bg.addColorStop(1, "#050816");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(120, 160, 220, 0.1)";
  ctx.lineWidth = 1;
  for (let k = 1; k <= 6; k += 1) {
    const radKpc = (rsKpc * k) / 2;
    const radPx = radKpc / kpcPerPixel;
    ctx.beginPath();
    ctx.arc(centerPx.x, centerPx.y, radPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  const virialFracs: { f: number; stroke: string }[] = [
    { f: 0.2, stroke: "rgba(255, 210, 140, 0.42)" },
    { f: 0.5, stroke: "rgba(255, 185, 100, 0.5)" },
    { f: 1, stroke: "rgba(255, 165, 70, 0.58)" }
  ];
  const labelAnglesRad = [2.5, 2.15, 1.75];
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < virialFracs.length; i += 1) {
    const { f, stroke } = virialFracs[i];
    const radKpc = f * rVirKpc;
    const radPx = radKpc / kpcPerPixel;
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    ctx.arc(centerPx.x, centerPx.y, radPx, 0, Math.PI * 2);
    ctx.stroke();
    const ang = labelAnglesRad[i] ?? 2.2;
    const lx = centerPx.x + (radPx + 18) * Math.cos(ang);
    const ly = centerPx.y - (radPx + 18) * Math.sin(ang);
    const label = `${f} r_vir (${formatKpcLabel(radKpc)} kpc)`;
    ctx.fillStyle = "rgba(255, 230, 200, 0.88)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, lx, ly);
    ctx.lineWidth = 1.5;
    ctx.fillText(label, lx, ly);
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(180, 200, 255, 0.08)";
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(centerPx.x, 0);
  ctx.lineTo(centerPx.x, height);
  ctx.stroke();
  ctx.setLineDash([]);

  const rsPx = rsKpc / kpcPerPixel;
  ctx.strokeStyle = "rgba(150, 220, 255, 0.45)";
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, rsPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (opts.showComTrail && comTrailPx.length >= 2) {
    ctx.strokeStyle = "rgba(255, 215, 130, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(comTrailPx[0].x, comTrailPx[0].y);
    for (let t = 1; t < comTrailPx.length; t += 1) {
      ctx.lineTo(comTrailPx[t].x, comTrailPx[t].y);
    }
    ctx.stroke();
  }

  const drawHost = (p: (typeof particles)[0]) => {
    const pos = toPixel(centerPx, p.positionKpc, kpcPerPixel);
    const r = particleRadius(p.massMsun);
    ctx.beginPath();
    if (opts.showWakeOverlay && Number.isFinite(p.overdensity)) {
      ctx.fillStyle = wakeColor(p.overdensity);
    } else {
      ctx.fillStyle = "rgba(160, 200, 255, 0.38)";
    }
    ctx.arc(pos.x, pos.y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawGalDm = (p: (typeof particles)[0]) => {
    const pos = toPixel(centerPx, p.positionKpc, kpcPerPixel);
    ctx.beginPath();
    ctx.fillStyle = "rgba(140, 240, 200, 0.92)";
    ctx.arc(pos.x, pos.y, particleRadius(p.massMsun), 0, Math.PI * 2);
    ctx.fill();
  };

  const drawStar = (p: (typeof particles)[0]) => {
    const pos = toPixel(centerPx, p.positionKpc, kpcPerPixel);
    const r = particleRadius(p.massMsun);
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 230, 140, 0.96)";
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const p of particles) {
    if (p.species === "host_dm") {
      drawHost(p);
    }
  }
  for (const p of particles) {
    if (p.species === "gal_dm") {
      drawGalDm(p);
    }
  }
  for (const p of particles) {
    if (p.species === "gal_star") {
      drawStar(p);
    }
  }

  const comGalPx = toPixel(centerPx, snapshot.comGalPosKpc, kpcPerPixel);
  ctx.strokeStyle = "rgba(255, 215, 130, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(comGalPx.x, comGalPx.y, 6, 0, Math.PI * 2);
  ctx.stroke();

  if (Number.isFinite(snapshot.comStarPosKpc.x)) {
    const ps = toPixel(centerPx, snapshot.comStarPosKpc, kpcPerPixel);
    ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
    ctx.beginPath();
    const s = 4;
    ctx.moveTo(ps.x, ps.y - s);
    ctx.lineTo(ps.x + s, ps.y + s);
    ctx.lineTo(ps.x - s, ps.y + s);
    ctx.closePath();
    ctx.fill();
  }
  if (Number.isFinite(snapshot.comDmPosKpc.x)) {
    const pd = toPixel(centerPx, snapshot.comDmPosKpc, kpcPerPixel);
    ctx.fillStyle = "rgba(120, 230, 180, 0.95)";
    ctx.fillRect(pd.x - 3.5, pd.y - 3.5, 7, 7);
  }

  if (opts.showVelocityVectors) {
    const scale = 0.04;
    ctx.lineWidth = 1;
    for (const p of particles) {
      if (p.species !== "gal_dm" && p.species !== "gal_star") {
        continue;
      }
      const pos = toPixel(centerPx, p.positionKpc, kpcPerPixel);
      const vx = p.velocityKms.x * scale;
      const vy = -p.velocityKms.y * scale;
      ctx.strokeStyle =
        p.species === "gal_star" ? "rgba(255, 220, 140, 0.65)" : "rgba(120, 255, 200, 0.65)";
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + vx, pos.y + vy);
      ctx.stroke();
    }
  }
}
