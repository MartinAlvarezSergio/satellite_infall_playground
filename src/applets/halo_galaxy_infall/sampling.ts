import { nfwMassEnclosed, nfwRho0FromMVir, nfwScaleRadius } from "../../physics/nfw";
import { G_KPC_MSUN } from "../../physics/units";
import { NfwComponentSpec, Species } from "./types";

export type SampledComponent = {
  species: Species;
  positionsKpc: Float64Array;
  velocitiesKms: Float64Array;
  massesMsun: Float64Array;
};

export type SampleOptions = {
  rng?: () => number;
  cdfTableSize?: number;
};

function defaultRng(): number {
  return Math.random();
}

/** Build monotonic CDF table for truncated NFW: F(r) = M(<r)/M_tot, r in [0, r_max]. */
function buildCdfTable(
  rMaxKpc: number,
  rsKpc: number,
  rho0: number,
  mTotalMsun: number,
  nTable: number
): { rTab: Float64Array; cdfTab: Float64Array } {
  const rTab = new Float64Array(nTable);
  const cdfTab = new Float64Array(nTable);
  const mTot = Math.max(mTotalMsun, 1e-300);
  for (let k = 0; k < nTable; k += 1) {
    const t = k / Math.max(nTable - 1, 1);
    const rKpc = t * rMaxKpc;
    rTab[k] = rKpc;
    const mEnc = nfwMassEnclosed(rKpc, rho0, rsKpc);
    cdfTab[k] = mEnc / mTot;
  }
  return { rTab, cdfTab };
}

function sampleRadiusFromCdf(
  u: number,
  rTab: Float64Array,
  cdfTab: Float64Array,
  rMaxKpc: number
): number {
  if (u <= cdfTab[0]) {
    return rTab[0];
  }
  const n = cdfTab.length;
  if (u >= cdfTab[n - 1]) {
    return rMaxKpc;
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cdfTab[mid] <= u) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const t = (u - cdfTab[lo]) / Math.max(cdfTab[hi] - cdfTab[lo], 1e-30);
  return rTab[lo] + t * (rTab[hi] - rTab[lo]);
}

function boxMuller(rng: () => number): [number, number] {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const m = Math.sqrt(-2 * Math.log(u1));
  const c = Math.cos(2 * Math.PI * u2);
  const s = Math.sin(2 * Math.PI * u2);
  return [m * c, m * s];
}

function comZero(comp: SampledComponent): void {
  const n = comp.massesMsun.length;
  if (n === 0) {
    return;
  }
  let mx = 0;
  let my = 0;
  let mvx = 0;
  let mvy = 0;
  let mtot = 0;
  for (let i = 0; i < n; i += 1) {
    const mi = comp.massesMsun[i];
    mtot += mi;
    mx += mi * comp.positionsKpc[i * 2];
    my += mi * comp.positionsKpc[i * 2 + 1];
    mvx += mi * comp.velocitiesKms[i * 2];
    mvy += mi * comp.velocitiesKms[i * 2 + 1];
  }
  const inv = 1 / Math.max(mtot, 1e-30);
  const cx = mx * inv;
  const cy = my * inv;
  const cvx = mvx * inv;
  const cvy = mvy * inv;
  for (let i = 0; i < n; i += 1) {
    comp.positionsKpc[i * 2] -= cx;
    comp.positionsKpc[i * 2 + 1] -= cy;
    comp.velocitiesKms[i * 2] -= cvx;
    comp.velocitiesKms[i * 2 + 1] -= cvy;
  }
}

/**
 * Sample one truncated NFW component in its rest frame (COM at origin).
 */
export function sampleNfwComponent(
  species: Species,
  spec: NfwComponentSpec,
  opts?: SampleOptions
): SampledComponent {
  const rng = opts?.rng ?? defaultRng;
  const nTable = opts?.cdfTableSize ?? 2048;
  const n = Math.max(0, Math.round(spec.count));
  if (n === 0) {
    return {
      species,
      positionsKpc: new Float64Array(0),
      velocitiesKms: new Float64Array(0),
      massesMsun: new Float64Array(0)
    };
  }

  const rMax = Math.max(spec.rMaxKpc, 1e-6);
  const c = Math.max(spec.concentration, 1e-6);
  const rs = nfwScaleRadius(rMax, c);
  const rho0 = nfwRho0FromMVir(spec.totalMassMsun, rMax, c);
  const { rTab, cdfTab } = buildCdfTable(rMax, rs, rho0, spec.totalMassMsun, nTable);
  const massEach = spec.totalMassMsun / n;

  const positionsKpc = new Float64Array(n * 2);
  const velocitiesKms = new Float64Array(n * 2);
  const massesMsun = new Float64Array(n);
  massesMsun.fill(massEach);

  for (let i = 0; i < n; i += 1) {
    const u = rng();
    const r = sampleRadiusFromCdf(u, rTab, cdfTab, rMax);
    const theta = rng() * 2 * Math.PI;
    positionsKpc[i * 2] = r * Math.cos(theta);
    positionsKpc[i * 2 + 1] = r * Math.sin(theta);

    const rSafe = Math.max(r, 1e-3 * rs);
    const mEnc = nfwMassEnclosed(rSafe, rho0, rs);
    const vc2 = (G_KPC_MSUN * mEnc) / rSafe;
    const sigma = Math.sqrt(Math.max(0.5 * vc2, 0));
    const [g1, g2] = boxMuller(rng);
    velocitiesKms[i * 2] = sigma * g1;
    velocitiesKms[i * 2 + 1] = sigma * g2;
  }

  const comp: SampledComponent = {
    species,
    positionsKpc,
    velocitiesKms,
    massesMsun
  };
  comZero(comp);

  if (n >= 200) {
    let mx = 0;
    let my = 0;
    let mvx = 0;
    let mvy = 0;
    let mtot = 0;
    for (let i = 0; i < n; i += 1) {
      const mi = massesMsun[i];
      mtot += mi;
      mx += mi * positionsKpc[i * 2];
      my += mi * positionsKpc[i * 2 + 1];
      mvx += mi * velocitiesKms[i * 2];
      mvy += mi * velocitiesKms[i * 2 + 1];
    }
    const inv = 1 / Math.max(mtot, 1e-30);
    if (
      Math.abs(mx * inv) > 1e-6 ||
      Math.abs(my * inv) > 1e-6 ||
      Math.abs(mvx * inv) > 1e-6 ||
      Math.abs(mvy * inv) > 1e-6
    ) {
      console.warn("[halo_galaxy_infall] COM zeroing drift > 1e-6 (kpc or km/s)");
    }
  }

  return comp;
}

export function shiftComponent(
  comp: SampledComponent,
  dxKpc: number,
  dyKpc: number,
  dvxKms: number,
  dvyKms: number
): void {
  const n = comp.massesMsun.length;
  for (let i = 0; i < n; i += 1) {
    comp.positionsKpc[i * 2] += dxKpc;
    comp.positionsKpc[i * 2 + 1] += dyKpc;
    comp.velocitiesKms[i * 2] += dvxKms;
    comp.velocitiesKms[i * 2 + 1] += dvyKms;
  }
}
