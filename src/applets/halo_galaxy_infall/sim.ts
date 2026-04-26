import {
  accumulateAccel2D,
  accumulatePotential2D,
  buildTree2D,
  DEFAULT_THETA2
} from "../../core/barnesHut2D";
import { Vec2 } from "../../core/vector";
import { nfwAnalyticAccelKms2PerKpc, nfwRho0FromMVir, nfwScaleRadius } from "../../physics/nfw";
import { G_KPC_MSUN, KM_PER_KPC, SEC_PER_MYR } from "../../physics/units";
import { defaultHaloGalaxyInfallSettings } from "./defaults";
import { sampleNfwComponent, type SampledComponent } from "./sampling";
import type {
  DiagnosticPoint,
  HaloGalaxyInfallSettings,
  HaloGalaxyInfallSnapshot,
  HaloMode,
  LaunchSpec,
  NfwComponentSpec,
  ParticleSnapshot,
  Species
} from "./types";

export const LOGICAL_WIDTH = 900;
export const LOGICAL_HEIGHT = 620;

const MAX_DTMYR_PER_SUB = 0.5;
const DIAG_APPEND_DT_MYR = 5;
const MAX_DIAG_POINTS = 1024;
const MAX_COM_TRAIL = 800;
const WAKE_R_BINS = 16;
const WAKE_T_BINS = 24;

const MIN_DT_S = 1 / 400;
const MAX_DT_S = 1 / 20;

type Ranges = {
  galDmStart: number;
  galDmEnd: number;
  galStarStart: number;
  galStarEnd: number;
  hostStart: number;
  hostEnd: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function speciesFromByte(b: number): Species {
  if (b === 2) {
    return "gal_star";
  }
  if (b === 1) {
    return "gal_dm";
  }
  return "host_dm";
}

export type HaloGalaxyInfallSim = {
  step: (dtRealSeconds: number) => void;
  reset: () => void;
  getSnapshot: () => HaloGalaxyInfallSnapshot;
  setHaloMode: (mode: HaloMode) => void;
  setEpsDmDmKpc: (v: number) => void;
  setEpsStarKpc: (v: number) => void;
  setFieldHalfWidthKpc: (v: number) => void;
  setTimeRateMyrPerSec: (v: number) => void;
  setShowWakeOverlay: (v: boolean) => void;
  setHostSpec: (s: NfwComponentSpec) => void;
  setGalDmSpec: (s: NfwComponentSpec) => void;
  setGalStarSpec: (s: NfwComponentSpec) => void;
  setLaunch: (l: LaunchSpec) => void;
};

function mergeGalaxyComponents(dm: SampledComponent, st: SampledComponent): {
  nDm: number;
  nSt: number;
  positionsKpc: Float64Array;
  velocitiesKms: Float64Array;
  massesMsun: Float64Array;
  isStar: Uint8Array;
  species: Uint8Array;
} {
  const nDm = dm.massesMsun.length;
  const nSt = st.massesMsun.length;
  const n = nDm + nSt;
  const positionsKpc = new Float64Array(n * 2);
  const velocitiesKms = new Float64Array(n * 2);
  const massesMsun = new Float64Array(n);
  const isStar = new Uint8Array(n);
  const species = new Uint8Array(n);

  for (let i = 0; i < nDm; i += 1) {
    positionsKpc[i * 2] = dm.positionsKpc[i * 2];
    positionsKpc[i * 2 + 1] = dm.positionsKpc[i * 2 + 1];
    velocitiesKms[i * 2] = dm.velocitiesKms[i * 2];
    velocitiesKms[i * 2 + 1] = dm.velocitiesKms[i * 2 + 1];
    massesMsun[i] = dm.massesMsun[i];
    isStar[i] = 0;
    species[i] = 1;
  }
  for (let i = 0; i < nSt; i += 1) {
    const j = nDm + i;
    positionsKpc[j * 2] = st.positionsKpc[i * 2];
    positionsKpc[j * 2 + 1] = st.positionsKpc[i * 2 + 1];
    velocitiesKms[j * 2] = st.velocitiesKms[i * 2];
    velocitiesKms[j * 2 + 1] = st.velocitiesKms[i * 2 + 1];
    massesMsun[j] = st.massesMsun[i];
    isStar[j] = 1;
    species[j] = 2;
  }

  return { nDm, nSt, positionsKpc, velocitiesKms, massesMsun, isStar, species };
}

function comZeroGalaxy(
  n: number,
  x: Float64Array,
  y: Float64Array,
  vx: Float64Array,
  vy: Float64Array,
  m: Float64Array
): void {
  if (n === 0) {
    return;
  }
  let mx = 0;
  let my = 0;
  let mvx = 0;
  let mvy = 0;
  let mtot = 0;
  for (let i = 0; i < n; i += 1) {
    const mi = m[i];
    mtot += mi;
    mx += mi * x[i];
    my += mi * y[i];
    mvx += mi * vx[i];
    mvy += mi * vy[i];
  }
  const inv = 1 / Math.max(mtot, 1e-300);
  const cx = mx * inv;
  const cy = my * inv;
  const cvx = mvx * inv;
  const cvy = mvy * inv;
  for (let i = 0; i < n; i += 1) {
    x[i] -= cx;
    y[i] -= cy;
    vx[i] -= cvx;
    vy[i] -= cvy;
  }
}

export function createHaloGalaxyInfallSim(initial?: HaloGalaxyInfallSettings): HaloGalaxyInfallSim {
  const centerPx: Vec2 = { x: LOGICAL_WIDTH / 2, y: LOGICAL_HEIGHT / 2 };
  const ini = initial ?? defaultHaloGalaxyInfallSettings();

  let hostSpec: NfwComponentSpec = { ...ini.host };
  let galDmSpec: NfwComponentSpec = { ...ini.galDm };
  let galStarSpec: NfwComponentSpec = { ...ini.galStar };
  let launch: LaunchSpec = { ...ini.launch };
  let haloMode: HaloMode = ini.haloMode;

  let epsDmDmKpc = ini.epsDmDmKpc;
  let epsStarKpc = ini.epsStarKpc;
  let fieldHalfWidthKpc = ini.fieldHalfWidthKpc;
  let timeRateMyrPerSec = ini.timeRateMyrPerSec;
  let showWakeOverlay = ini.showWakeOverlay;

  let N = 0;
  let ranges: Ranges = {
    galDmStart: 0,
    galDmEnd: 0,
    galStarStart: 0,
    galStarEnd: 0,
    hostStart: 0,
    hostEnd: 0
  };

  let x = new Float64Array(0);
  let y = new Float64Array(0);
  let vx = new Float64Array(0);
  let vy = new Float64Array(0);
  let m = new Float64Array(0);
  let isStar = new Uint8Array(0);
  let species = new Uint8Array(0);
  let ax = new Float64Array(0);
  let ay = new Float64Array(0);

  let scratchDmIdx = new Int32Array(1024);
  let scratchStarIdx = new Int32Array(1024);
  let scratchGalDmIdx = new Int32Array(1024);
  let scratchGalStarIdx = new Int32Array(1024);

  function ensureIndexScratch(n: number): void {
    if (scratchDmIdx.length >= n) {
      return;
    }
    scratchDmIdx = new Int32Array(n);
    scratchStarIdx = new Int32Array(n);
    scratchGalDmIdx = new Int32Array(n);
    scratchGalStarIdx = new Int32Array(n);
  }

  let tMyr = 0;
  let diagSinceLastAppendMyr = 0;
  const diagnostics: DiagnosticPoint[] = [];
  const comTrailPx: Vec2[] = [];

  function derivedHost(): { rho0: number; rsKpc: number; rVirKpc: number; mDmVirMsun: number } {
    const rVirKpc = hostSpec.rMaxKpc;
    const c = hostSpec.concentration;
    const rsKpc = nfwScaleRadius(rVirKpc, c);
    const rho0 = nfwRho0FromMVir(hostSpec.totalMassMsun, rVirKpc, c);
    return { rho0, rsKpc, rVirKpc, mDmVirMsun: hostSpec.totalMassMsun };
  }

  function kpcPerPixel(): number {
    return fieldHalfWidthKpc / (LOGICAL_WIDTH / 2);
  }

  function toPixel(px: number, py: number): Vec2 {
    const kpp = kpcPerPixel();
    return { x: centerPx.x + px / kpp, y: centerPx.y - py / kpp };
  }

  function rebuildState(): void {
    const dm = sampleNfwComponent("gal_dm", galDmSpec);
    const st = sampleNfwComponent("gal_star", galStarSpec);
    const merged = mergeGalaxyComponents(dm, st);
    const nGal = merged.massesMsun.length;

    let nx = new Float64Array(nGal);
    let ny = new Float64Array(nGal);
    let nvx = new Float64Array(nGal);
    let nvy = new Float64Array(nGal);
    let nm = new Float64Array(nGal);
    let nIs = new Uint8Array(nGal);
    let nSp = new Uint8Array(nGal);

    for (let i = 0; i < nGal; i += 1) {
      nx[i] = merged.positionsKpc[i * 2];
      ny[i] = merged.positionsKpc[i * 2 + 1];
      nvx[i] = merged.velocitiesKms[i * 2];
      nvy[i] = merged.velocitiesKms[i * 2 + 1];
      nm[i] = merged.massesMsun[i];
      nIs[i] = merged.isStar[i];
      nSp[i] = merged.species[i];
    }
    if (nGal > 0) {
      comZeroGalaxy(nGal, nx, ny, nvx, nvy, nm);
      for (let i = 0; i < nGal; i += 1) {
        nx[i] += launch.rStartKpc;
        nvx[i] += launch.vRadialKms;
        nvy[i] += launch.vTangentialKms;
      }
    }

    ranges = {
      galDmStart: 0,
      galDmEnd: merged.nDm,
      galStarStart: merged.nDm,
      galStarEnd: nGal,
      hostStart: nGal,
      hostEnd: nGal
    };

    let nTotal = nGal;
    if (haloMode === "live" && hostSpec.count > 0) {
      const host = sampleNfwComponent("host_dm", hostSpec);
      const nh = host.massesMsun.length;
      const bx = new Float64Array(nGal + nh);
      const by = new Float64Array(nGal + nh);
      const bvx = new Float64Array(nGal + nh);
      const bvy = new Float64Array(nGal + nh);
      const bm = new Float64Array(nGal + nh);
      const bIs = new Uint8Array(nGal + nh);
      const bSp = new Uint8Array(nGal + nh);
      bx.set(nx.subarray(0, nGal));
      by.set(ny.subarray(0, nGal));
      bvx.set(nvx.subarray(0, nGal));
      bvy.set(nvy.subarray(0, nGal));
      bm.set(nm.subarray(0, nGal));
      bIs.set(nIs.subarray(0, nGal));
      bSp.set(nSp.subarray(0, nGal));
      for (let i = 0; i < nh; i += 1) {
        const j = nGal + i;
        bx[j] = host.positionsKpc[i * 2];
        by[j] = host.positionsKpc[i * 2 + 1];
        bvx[j] = host.velocitiesKms[i * 2];
        bvy[j] = host.velocitiesKms[i * 2 + 1];
        bm[j] = host.massesMsun[i];
        bIs[j] = 0;
        bSp[j] = 0;
      }
      nx = bx;
      ny = by;
      nvx = bvx;
      nvy = bvy;
      nm = bm;
      nIs = bIs;
      nSp = bSp;
      nTotal = nGal + nh;
      ranges.hostStart = nGal;
      ranges.hostEnd = nTotal;
    }

    N = nTotal;
    x = new Float64Array(N);
    y = new Float64Array(N);
    vx = new Float64Array(N);
    vy = new Float64Array(N);
    m = new Float64Array(N);
    isStar = new Uint8Array(N);
    species = new Uint8Array(N);
    ax = new Float64Array(N);
    ay = new Float64Array(N);
    for (let i = 0; i < N; i += 1) {
      x[i] = nx[i];
      y[i] = ny[i];
      vx[i] = nvx[i];
      vy[i] = nvy[i];
      m[i] = nm[i];
      isStar[i] = nIs[i];
      species[i] = nSp[i];
    }

    tMyr = 0;
    diagSinceLastAppendMyr = 0;
    diagnostics.length = 0;
    comTrailPx.length = 0;
    diagnostics.push(computeDiagnosticPoint());
  }

  function trimToGalaxyOnly(): void {
    const end = ranges.galStarEnd;
    if (end >= N) {
      ranges.hostStart = N;
      ranges.hostEnd = N;
      return;
    }
    N = end;
    if (N === 0) {
      x = new Float64Array(0);
      y = new Float64Array(0);
      vx = new Float64Array(0);
      vy = new Float64Array(0);
      m = new Float64Array(0);
      isStar = new Uint8Array(0);
      species = new Uint8Array(0);
      ax = new Float64Array(0);
      ay = new Float64Array(0);
    } else {
      x = x.slice(0, end);
      y = y.slice(0, end);
      vx = vx.slice(0, end);
      vy = vy.slice(0, end);
      m = m.slice(0, end);
      isStar = isStar.slice(0, end);
      species = species.slice(0, end);
      ax = new Float64Array(end);
      ay = new Float64Array(end);
    }
    ranges.hostStart = end;
    ranges.hostEnd = end;
  }

  function appendHostToExistingGalaxy(): void {
    if (hostSpec.count <= 0) {
      return;
    }
    const host = sampleNfwComponent("host_dm", hostSpec);
    const nh = host.massesMsun.length;
    const nGal = ranges.galStarEnd;
    const nNew = nGal + nh;
    const nx = new Float64Array(nNew);
    const ny = new Float64Array(nNew);
    const nvx = new Float64Array(nNew);
    const nvy = new Float64Array(nNew);
    const nm = new Float64Array(nNew);
    const nIs = new Uint8Array(nNew);
    const nSp = new Uint8Array(nNew);
    nx.set(x.subarray(0, nGal));
    ny.set(y.subarray(0, nGal));
    nvx.set(vx.subarray(0, nGal));
    nvy.set(vy.subarray(0, nGal));
    nm.set(m.subarray(0, nGal));
    nIs.set(isStar.subarray(0, nGal));
    nSp.set(species.subarray(0, nGal));
    for (let i = 0; i < nh; i += 1) {
      const j = nGal + i;
      nx[j] = host.positionsKpc[i * 2];
      ny[j] = host.positionsKpc[i * 2 + 1];
      nvx[j] = host.velocitiesKms[i * 2];
      nvy[j] = host.velocitiesKms[i * 2 + 1];
      nm[j] = host.massesMsun[i];
      nIs[j] = 0;
      nSp[j] = 0;
    }
    N = nNew;
    x = nx;
    y = ny;
    vx = nvx;
    vy = nvy;
    m = nm;
    isStar = nIs;
    species = nSp;
    ax = new Float64Array(N);
    ay = new Float64Array(N);
    ranges.hostStart = nGal;
    ranges.hostEnd = N;
  }

  function computeAccelerations(): void {
    ax.fill(0);
    ay.fill(0);
    if (N === 0) {
      return;
    }
    const eps2Dm = epsDmDmKpc * epsDmDmKpc;
    const eps2Star = epsStarKpc * epsStarKpc;
    const Gkm = G_KPC_MSUN;
    const theta2 = DEFAULT_THETA2;

    ensureIndexScratch(N);
    let nDm = 0;
    let nSt = 0;
    for (let i = 0; i < N; i += 1) {
      if (isStar[i]) {
        scratchStarIdx[nSt] = i;
        nSt += 1;
      } else {
        scratchDmIdx[nDm] = i;
        nDm += 1;
      }
    }
    const dmTree = buildTree2D(x, y, m, scratchDmIdx.subarray(0, nDm), 0);
    const starTree = buildTree2D(x, y, m, scratchStarIdx.subarray(0, nSt), 1);

    const out = { ax: 0, ay: 0 };
    for (let i = 0; i < N; i += 1) {
      const eps2DmWalk = isStar[i] ? eps2Star : eps2Dm;
      const selfDm = isStar[i] ? -1 : i;
      const selfStar = isStar[i] ? i : -1;
      out.ax = 0;
      out.ay = 0;
      accumulateAccel2D(dmTree, x, y, m, x[i], y[i], eps2DmWalk, theta2, selfDm, out);
      accumulateAccel2D(starTree, x, y, m, x[i], y[i], eps2Star, theta2, selfStar, out);
      ax[i] = out.ax * Gkm;
      ay[i] = out.ay * Gkm;
    }

    if (haloMode === "fixed_nfw") {
      const { rho0, rsKpc } = derivedHost();
      for (let i = 0; i < N; i += 1) {
        const a = nfwAnalyticAccelKms2PerKpc(x[i], y[i], rho0, rsKpc, epsDmDmKpc);
        ax[i] += a.x;
        ay[i] += a.y;
      }
    }
  }

  function halfKick(dtS: number): void {
    const k = (dtS / KM_PER_KPC) * 0.5;
    for (let i = 0; i < N; i += 1) {
      vx[i] += ax[i] * k;
      vy[i] += ay[i] * k;
    }
  }

  function drift(dtS: number): void {
    const k = dtS / KM_PER_KPC;
    for (let i = 0; i < N; i += 1) {
      x[i] += vx[i] * k;
      y[i] += vy[i] * k;
    }
  }

  function computeDiagnosticPoint(): DiagnosticPoint {
    const g0 = ranges.galDmStart;
    const g1 = ranges.galStarEnd;
    let mtot = 0;
    let mx = 0;
    let my = 0;
    let mvx = 0;
    let mvy = 0;
    for (let i = g0; i < g1; i += 1) {
      const mi = m[i];
      mtot += mi;
      mx += mi * x[i];
      my += mi * y[i];
      mvx += mi * vx[i];
      mvy += mi * vy[i];
    }
    const inv = mtot > 1e-300 ? 1 / mtot : 0;
    const comx = mx * inv;
    const comy = my * inv;
    const comvx = mvx * inv;
    const comvy = mvy * inv;

    let msStar = 0;
    let msDm = 0;
    for (let i = ranges.galDmStart; i < ranges.galDmEnd; i += 1) {
      msDm += m[i];
    }
    for (let i = ranges.galStarStart; i < ranges.galStarEnd; i += 1) {
      msStar += m[i];
    }

    const rHalfStar = halfMassRadius(
      ranges.galStarStart,
      ranges.galStarEnd,
      comx,
      comy,
      msStar
    );
    const rHalfDm = halfMassRadius(ranges.galDmStart, ranges.galDmEnd, comx, comy, msDm);

    const bfStar = boundFraction(
      ranges.galStarStart,
      ranges.galStarEnd,
      g0,
      g1,
      comvx,
      comvy,
      epsDmDmKpc,
      epsStarKpc
    );
    const bfDm = boundFraction(
      ranges.galDmStart,
      ranges.galDmEnd,
      g0,
      g1,
      comvx,
      comvy,
      epsDmDmKpc,
      epsStarKpc
    );

    return {
      tMyr,
      rHalfStar,
      rHalfDm,
      boundFractionStar: bfStar,
      boundFractionDm: bfDm
    };
  }

  function halfMassRadius(i0: number, i1: number, comx: number, comy: number, mSpecies: number): number {
    if (i1 <= i0 || mSpecies <= 0) {
      return 0;
    }
    const n = i1 - i0;
    const dist = new Float64Array(n);
    const mass = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
      const i = i0 + k;
      const dx = x[i] - comx;
      const dy = y[i] - comy;
      dist[k] = Math.hypot(dx, dy);
      mass[k] = m[i];
    }
    const idx = Array.from({ length: n }, (_, j) => j);
    idx.sort((a, b) => dist[a] - dist[b]);
    const target = 0.5 * mSpecies;
    let cum = 0;
    for (let t = 0; t < n; t += 1) {
      const j = idx[t];
      cum += mass[j];
      if (cum >= target) {
        return dist[j];
      }
    }
    return dist[idx[n - 1]];
  }

  function boundFraction(
    i0: number,
    i1: number,
    g0: number,
    g1: number,
    comvx: number,
    comvy: number,
    epsDm: number,
    epsSt: number
  ): number {
    if (i1 <= i0) {
      return 1;
    }
    const nGal = g1 - g0;
    if (nGal <= 0) {
      return 1;
    }
    ensureIndexScratch(Math.max(N, nGal + 1));
    let ngd = 0;
    let ngs = 0;
    for (let j = g0; j < g1; j += 1) {
      if (isStar[j]) {
        scratchGalStarIdx[ngs] = j;
        ngs += 1;
      } else {
        scratchGalDmIdx[ngd] = j;
        ngd += 1;
      }
    }
    const galDmTree = buildTree2D(x, y, m, scratchGalDmIdx.subarray(0, ngd), 0);
    const galStarTree = buildTree2D(x, y, m, scratchGalStarIdx.subarray(0, ngs), 1);
    const eps2DmSq = epsDm * epsDm;
    const eps2StarSq = epsSt * epsSt;
    const theta2 = DEFAULT_THETA2;

    let bound = 0;
    const nSpecies = i1 - i0;
    for (let ii = i0; ii < i1; ii += 1) {
      const dvx = vx[ii] - comvx;
      const dvy = vy[ii] - comvy;
      const ke = 0.5 * m[ii] * (dvx * dvx + dvy * dvy);
      let phi = 0;
      if (isStar[ii]) {
        phi += accumulatePotential2D(
          galDmTree,
          x,
          y,
          m,
          x[ii],
          y[ii],
          eps2StarSq,
          theta2,
          -1
        );
        phi += accumulatePotential2D(
          galStarTree,
          x,
          y,
          m,
          x[ii],
          y[ii],
          eps2StarSq,
          theta2,
          ii
        );
      } else {
        phi += accumulatePotential2D(
          galDmTree,
          x,
          y,
          m,
          x[ii],
          y[ii],
          eps2DmSq,
          theta2,
          ii
        );
        phi += accumulatePotential2D(
          galStarTree,
          x,
          y,
          m,
          x[ii],
          y[ii],
          eps2StarSq,
          theta2,
          -1
        );
      }
      const pe = G_KPC_MSUN * m[ii] * phi;
      if (ke + pe < 0) {
        bound += 1;
      }
    }
    return bound / nSpecies;
  }

  function appendDiagnosticsIfNeeded(dMyr: number): void {
    diagSinceLastAppendMyr += dMyr;
    if (diagnostics.length > 0 && diagSinceLastAppendMyr < DIAG_APPEND_DT_MYR) {
      return;
    }
    diagSinceLastAppendMyr = 0;
    diagnostics.push(computeDiagnosticPoint());
    if (diagnostics.length > MAX_DIAG_POINTS) {
      diagnostics.splice(0, diagnostics.length - MAX_DIAG_POINTS);
    }

    const g0 = ranges.galDmStart;
    const g1 = ranges.galStarEnd;
    if (g1 <= g0) {
      return;
    }
    let mtot = 0;
    let mx = 0;
    let my = 0;
    for (let i = g0; i < g1; i += 1) {
      mtot += m[i];
      mx += m[i] * x[i];
      my += m[i] * y[i];
    }
    if (mtot <= 1e-300) {
      return;
    }
    const inv = 1 / mtot;
    const px = toPixel(mx * inv, my * inv);
    comTrailPx.push(px);
    if (comTrailPx.length > MAX_COM_TRAIL) {
      comTrailPx.splice(0, comTrailPx.length - MAX_COM_TRAIL);
    }
  }

  function computeWakeOverdensities(comx: number, comy: number): Float64Array {
    const out = new Float64Array(N);
    out.fill(Number.NaN);
    if (!showWakeOverlay || ranges.hostEnd <= ranges.hostStart) {
      return out;
    }

    const rMin = 0.5;
    const rMax = Math.max(1.2 * fieldHalfWidthKpc, rMin * 1.01);
    const logSpan = Math.log(rMax / rMin);
    const cells = new Int32Array(WAKE_R_BINS * WAKE_T_BINS);
    const particleBin = new Int32Array(N);
    particleBin.fill(-1);

    for (let i = ranges.hostStart; i < ranges.hostEnd; i += 1) {
      const dx = x[i] - comx;
      const dy = y[i] - comy;
      const r = Math.hypot(dx, dy);
      if (r < rMin || r > rMax) {
        continue;
      }
      let rBin = Math.floor((Math.log(r / rMin) / logSpan) * WAKE_R_BINS);
      rBin = clamp(rBin, 0, WAKE_R_BINS - 1);
      let tBin = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * WAKE_T_BINS);
      tBin = clamp(tBin, 0, WAKE_T_BINS - 1);
      const bin = rBin * WAKE_T_BINS + tBin;
      cells[bin] += 1;
      particleBin[i] = bin;
    }

    const azMean = new Float64Array(WAKE_R_BINS);
    for (let r = 0; r < WAKE_R_BINS; r += 1) {
      let s = 0;
      for (let t = 0; t < WAKE_T_BINS; t += 1) {
        s += cells[r * WAKE_T_BINS + t];
      }
      azMean[r] = s / WAKE_T_BINS;
    }

    for (let i = ranges.hostStart; i < ranges.hostEnd; i += 1) {
      const b = particleBin[i];
      if (b < 0) {
        out[i] = 0;
      } else {
        const rBin = Math.floor(b / WAKE_T_BINS);
        const mean = azMean[rBin];
        out[i] = (cells[b] - mean) / Math.max(mean, 1);
      }
    }
    return out;
  }

  rebuildState();

  return {
    step(dtRealSeconds: number): void {
      if (N === 0) {
        return;
      }
      const dtReal = clamp(dtRealSeconds, MIN_DT_S, MAX_DT_S);
      let remainingMyr = dtReal * timeRateMyrPerSec;
      while (remainingMyr > 1e-15) {
        const dMyr = Math.min(remainingMyr, MAX_DTMYR_PER_SUB);
        remainingMyr -= dMyr;
        const dtS = dMyr * SEC_PER_MYR;

        computeAccelerations();
        halfKick(dtS);
        drift(dtS);
        computeAccelerations();
        halfKick(dtS);

        tMyr += dMyr;
        appendDiagnosticsIfNeeded(dMyr);
      }
    },

    reset(): void {
      rebuildState();
    },

    getSnapshot(): HaloGalaxyInfallSnapshot {
      const kpp = kpcPerPixel();
      const hd = derivedHost();
      const g0 = ranges.galDmStart;
      const g1 = ranges.galStarEnd;

      let mtot = 0;
      let mx = 0;
      let my = 0;
      for (let i = g0; i < g1; i += 1) {
        const mi = m[i];
        mtot += mi;
        mx += mi * x[i];
        my += mi * y[i];
      }
      const inv = mtot > 1e-300 ? 1 / mtot : 0;
      const comGal: Vec2 = { x: mx * inv, y: my * inv };

      let msStar = 0;
      let msDm = 0;
      let sx = 0;
      let sy = 0;
      let dx = 0;
      let dy = 0;
      for (let i = ranges.galStarStart; i < ranges.galStarEnd; i += 1) {
        const mi = m[i];
        msStar += mi;
        sx += mi * x[i];
        sy += mi * y[i];
      }
      for (let i = ranges.galDmStart; i < ranges.galDmEnd; i += 1) {
        const mi = m[i];
        msDm += mi;
        dx += mi * x[i];
        dy += mi * y[i];
      }
      const comStar: Vec2 =
        msStar > 1e-300 ? { x: sx / msStar, y: sy / msStar } : { x: Number.NaN, y: Number.NaN };
      const comDm: Vec2 =
        msDm > 1e-300 ? { x: dx / msDm, y: dy / msDm } : { x: Number.NaN, y: Number.NaN };

      const overd = computeWakeOverdensities(comGal.x, comGal.y);

      const particles: ParticleSnapshot[] = [];
      for (let i = 0; i < N; i += 1) {
        const sp = speciesFromByte(species[i]);
        particles.push({
          positionKpc: { x: x[i], y: y[i] },
          velocityKms: { x: vx[i], y: vy[i] },
          massMsun: m[i],
          species: sp,
          overdensity: overd[i]
        });
      }

      return {
        width: LOGICAL_WIDTH,
        height: LOGICAL_HEIGHT,
        centerPx,
        kpcPerPixel: kpp,
        particles,
        comGalPosKpc: comGal,
        comStarPosKpc: comStar,
        comDmPosKpc: comDm,
        diagnostics: diagnostics.map((d) => ({ ...d })),
        comTrailPx: comTrailPx.map((p) => ({ ...p })),
        hostDerived: {
          rho0MsunPerKpc3: hd.rho0,
          rsKpc: hd.rsKpc,
          rVirKpc: hd.rVirKpc,
          mDmVirMsun: hd.mDmVirMsun
        },
        counts: {
          hostDm: Math.max(0, ranges.hostEnd - ranges.hostStart),
          galDm: Math.max(0, ranges.galDmEnd - ranges.galDmStart),
          galStar: Math.max(0, ranges.galStarEnd - ranges.galStarStart)
        },
        tMyr
      };
    },

    setHaloMode(mode: HaloMode): void {
      if (mode === haloMode) {
        return;
      }
      const prev = haloMode;
      haloMode = mode;
      if (prev === "live" && mode === "fixed_nfw") {
        trimToGalaxyOnly();
      } else if (prev === "fixed_nfw" && mode === "live") {
        appendHostToExistingGalaxy();
      }
    },

    setEpsDmDmKpc(v: number): void {
      epsDmDmKpc = v;
    },
    setEpsStarKpc(v: number): void {
      epsStarKpc = v;
    },
    setFieldHalfWidthKpc(v: number): void {
      fieldHalfWidthKpc = v;
    },
    setTimeRateMyrPerSec(v: number): void {
      timeRateMyrPerSec = v;
    },
    setShowWakeOverlay(v: boolean): void {
      showWakeOverlay = v;
    },
    setHostSpec(s: NfwComponentSpec): void {
      hostSpec = { ...s };
    },
    setGalDmSpec(s: NfwComponentSpec): void {
      galDmSpec = { ...s };
    },
    setGalStarSpec(s: NfwComponentSpec): void {
      galStarSpec = { ...s };
    },
    setLaunch(l: LaunchSpec): void {
      launch = { ...l };
    }
  };
}
