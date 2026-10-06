import type { DiagnosticPoint } from "./types";

/**
 * Small time-series plots for the stage inset. `w` and `h` are logical units; the caller
 * scales the context to the canvas backing store (setLogicalTransform) before drawing.
 */

const STAR_COLOR = "rgba(255, 210, 120, 0.9)";
const DM_COLOR = "rgba(120, 240, 200, 0.9)";
const TEXT_COLOR = "rgba(220, 225, 240, 0.85)";
const AXIS_COLOR = "rgba(200, 210, 230, 0.6)";
const GRID_COLOR = "rgba(100, 120, 160, 0.35)";
const FONT = "11px ui-sans-serif, system-ui, sans-serif";
const SMALL_FONT = "10px ui-sans-serif, system-ui, sans-serif";
const MARGIN = { l: 30, r: 8, t: 20, b: 14 };

function padRange(min: number, max: number, frac: number): { lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { lo: min - 0.5, hi: max + 0.5 };
  }
  const span = max - min;
  const p = span * frac;
  return { lo: min - p, hi: max + p };
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#060a14");
  bg.addColorStop(1, "#0a1020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, h: number, text: string): void {
  ctx.fillStyle = "rgba(200,210,230,0.7)";
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 10, h / 2);
}

/** Title on the left, colour key (stars gold, gal DM green) on the right. */
function drawHeader(ctx: CanvasRenderingContext2D, w: number, title: string): void {
  ctx.font = FONT;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(title, MARGIN.l, 13);
  ctx.textAlign = "right";
  ctx.fillStyle = DM_COLOR;
  ctx.fillText("gal DM", w - MARGIN.r, 13);
  const dmWidth = ctx.measureText("gal DM").width;
  ctx.fillStyle = STAR_COLOR;
  ctx.fillText("stars", w - MARGIN.r - dmWidth - 10, 13);
}

function drawGrid(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g += 1) {
    const yy = MARGIN.t + (ih * g) / 4;
    ctx.beginPath();
    ctx.moveTo(MARGIN.l, yy);
    ctx.lineTo(MARGIN.l + iw, yy);
    ctx.stroke();
  }
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  points: DiagnosticPoint[],
  color: string,
  px: (p: DiagnosticPoint) => number,
  py: (p: DiagnosticPoint) => number
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(px(points[0]), py(points[0]));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(px(points[i]), py(points[i]));
  }
  ctx.stroke();
}

function drawYLabel(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  ctx.font = SMALL_FONT;
  ctx.fillStyle = AXIS_COLOR;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(text, MARGIN.l - 4, y);
}

/** Time span of the data, written under the first and last points. */
function drawTimeLabels(
  ctx: CanvasRenderingContext2D,
  h: number,
  tMin: number,
  tMax: number,
  tx: (t: number) => number
): void {
  ctx.font = SMALL_FONT;
  ctx.fillStyle = AXIS_COLOR;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(tMin.toFixed(0), tx(tMin), h - 3);
  ctx.textAlign = "right";
  ctx.fillText(`${tMax.toFixed(0)} Myr`, tx(tMax), h - 3);
}

function formatKpc(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
}

function timeRange(points: DiagnosticPoint[]): { tMin: number; tMax: number } {
  let tMin = points[0].tMyr;
  let tMax = points[0].tMyr;
  for (const p of points) {
    tMin = Math.min(tMin, p.tMyr);
    tMax = Math.max(tMax, p.tMyr);
  }
  return { tMin, tMax };
}

export function renderRHalfPlot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: DiagnosticPoint[]
): void {
  drawBackground(ctx, w, h);

  if (points.length < 2) {
    drawPlaceholder(ctx, h, "Half-mass radius vs time (need more evolution)");
    return;
  }

  const { tMin, tMax } = timeRange(points);
  let yMin = Math.min(points[0].rHalfStar, points[0].rHalfDm);
  let yMax = Math.max(points[0].rHalfStar, points[0].rHalfDm);
  for (const p of points) {
    yMin = Math.min(yMin, p.rHalfStar, p.rHalfDm);
    yMax = Math.max(yMax, p.rHalfStar, p.rHalfDm);
  }
  const tp = padRange(tMin, tMax, 0.05);
  const yp = padRange(yMin, yMax, 0.08);
  const iw = w - MARGIN.l - MARGIN.r;
  const ih = h - MARGIN.t - MARGIN.b;

  const tx = (t: number) => MARGIN.l + ((t - tp.lo) / Math.max(tp.hi - tp.lo, 1e-9)) * iw;
  const yx = (y: number) => MARGIN.t + ih - ((y - yp.lo) / Math.max(yp.hi - yp.lo, 1e-9)) * ih;

  drawGrid(ctx, iw, ih);
  drawSeries(ctx, points, STAR_COLOR, (p) => tx(p.tMyr), (p) => yx(p.rHalfStar));
  drawSeries(ctx, points, DM_COLOR, (p) => tx(p.tMyr), (p) => yx(p.rHalfDm));

  drawHeader(ctx, w, "r_half (kpc)");
  drawYLabel(ctx, formatKpc(yMax), yx(yMax));
  drawYLabel(ctx, formatKpc(yMin), yx(yMin));
  drawTimeLabels(ctx, h, tMin, tMax, tx);
}

export function renderBoundFractionPlot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: DiagnosticPoint[]
): void {
  drawBackground(ctx, w, h);

  if (points.length < 2) {
    drawPlaceholder(ctx, h, "Bound fraction vs time (need more evolution)");
    return;
  }

  const { tMin, tMax } = timeRange(points);
  const tp = padRange(tMin, tMax, 0.05);
  const iw = w - MARGIN.l - MARGIN.r;
  const ih = h - MARGIN.t - MARGIN.b;
  const tx = (t: number) => MARGIN.l + ((t - tp.lo) / Math.max(tp.hi - tp.lo, 1e-9)) * iw;
  const yx = (f: number) => MARGIN.t + ih - f * ih;

  drawGrid(ctx, iw, ih);
  drawSeries(ctx, points, STAR_COLOR, (p) => tx(p.tMyr), (p) => yx(p.boundFractionStar));
  drawSeries(ctx, points, DM_COLOR, (p) => tx(p.tMyr), (p) => yx(p.boundFractionDm));

  drawHeader(ctx, w, "Bound fraction");
  drawYLabel(ctx, "1", yx(1));
  drawYLabel(ctx, "0", yx(0));
  drawTimeLabels(ctx, h, tMin, tMax, tx);
}
