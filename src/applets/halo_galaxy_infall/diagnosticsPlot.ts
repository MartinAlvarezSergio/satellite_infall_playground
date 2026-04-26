import type { DiagnosticPoint } from "./types";

function padRange(min: number, max: number, frac: number): { lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { lo: min - 0.5, hi: max + 0.5 };
  }
  const span = max - min;
  const p = span * frac;
  return { lo: min - p, hi: max + p };
}

export function renderRHalfPlot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: DiagnosticPoint[]
): void {
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#060a14");
  bg.addColorStop(1, "#0a1020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (points.length < 2) {
    ctx.fillStyle = "rgba(200,210,230,0.7)";
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText("Half-mass radius vs time (need more evolution)", 16, h / 2);
    return;
  }

  let tMin = points[0].tMyr;
  let tMax = points[0].tMyr;
  let yMin = Math.min(points[0].rHalfStar, points[0].rHalfDm);
  let yMax = Math.max(points[0].rHalfStar, points[0].rHalfDm);
  for (const p of points) {
    tMin = Math.min(tMin, p.tMyr);
    tMax = Math.max(tMax, p.tMyr);
    yMin = Math.min(yMin, p.rHalfStar, p.rHalfDm);
    yMax = Math.max(yMax, p.rHalfStar, p.rHalfDm);
  }
  const tp = padRange(tMin, tMax, 0.05);
  const yp = padRange(yMin, yMax, 0.08);
  const margin = { l: 48, r: 12, t: 28, b: 36 };
  const iw = w - margin.l - margin.r;
  const ih = h - margin.t - margin.b;

  const tx = (t: number) => margin.l + ((t - tp.lo) / Math.max(tp.hi - tp.lo, 1e-9)) * iw;
  const yx = (y: number) => margin.t + ih - ((y - yp.lo) / Math.max(yp.hi - yp.lo, 1e-9)) * ih;

  ctx.strokeStyle = "rgba(100,120,160,0.35)";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g += 1) {
    const yy = margin.t + (ih * g) / 4;
    ctx.beginPath();
    ctx.moveTo(margin.l, yy);
    ctx.lineTo(margin.l + iw, yy);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 210, 120, 0.9)";
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(tx(points[0].tMyr), yx(points[0].rHalfStar));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(tx(points[i].tMyr), yx(points[i].rHalfStar));
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(120, 240, 200, 0.9)";
  ctx.beginPath();
  ctx.moveTo(tx(points[0].tMyr), yx(points[0].rHalfDm));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(tx(points[i].tMyr), yx(points[i].rHalfDm));
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(220,225,240,0.85)";
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText("r_half (kpc) — stars (gold), gal DM (green)", margin.l, 16);
  ctx.fillText(`t: ${tp.lo.toFixed(0)}–${tp.hi.toFixed(0)} Myr`, margin.l + iw - 160, 16);
}

export function renderBoundFractionPlot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: DiagnosticPoint[]
): void {
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#060a14");
  bg.addColorStop(1, "#0a1020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (points.length < 2) {
    ctx.fillStyle = "rgba(200,210,230,0.7)";
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText("Bound fraction vs time (need more evolution)", 16, h / 2);
    return;
  }

  let tMin = points[0].tMyr;
  let tMax = points[0].tMyr;
  for (const p of points) {
    tMin = Math.min(tMin, p.tMyr);
    tMax = Math.max(tMax, p.tMyr);
  }
  const tp = padRange(tMin, tMax, 0.05);
  const margin = { l: 48, r: 12, t: 28, b: 36 };
  const iw = w - margin.l - margin.r;
  const ih = h - margin.t - margin.b;
  const tx = (t: number) => margin.l + ((t - tp.lo) / Math.max(tp.hi - tp.lo, 1e-9)) * iw;
  const yx = (f: number) => margin.t + ih - f * ih;

  ctx.strokeStyle = "rgba(100,120,160,0.35)";
  for (let g = 0; g <= 4; g += 1) {
    const yy = margin.t + (ih * g) / 4;
    ctx.beginPath();
    ctx.moveTo(margin.l, yy);
    ctx.lineTo(margin.l + iw, yy);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 210, 120, 0.9)";
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(tx(points[0].tMyr), yx(points[0].boundFractionStar));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(tx(points[i].tMyr), yx(points[i].boundFractionStar));
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(120, 240, 200, 0.9)";
  ctx.beginPath();
  ctx.moveTo(tx(points[0].tMyr), yx(points[0].boundFractionDm));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(tx(points[i].tMyr), yx(points[i].boundFractionDm));
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(220,225,240,0.85)";
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText("Bound fraction (galaxy COM frame) — stars, gal DM", margin.l, 16);
}
