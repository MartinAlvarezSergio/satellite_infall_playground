import { Vec2 } from "../../core/vector";

export type HaloMode = "live" | "fixed_nfw";

export type Species = "host_dm" | "gal_dm" | "gal_star";

/** Per-component NFW parameters. rMaxKpc = r_vir for host, r_t for galaxy components. */
export type NfwComponentSpec = {
  totalMassMsun: number;
  rMaxKpc: number;
  concentration: number;
  count: number;
};

export type LaunchSpec = {
  rStartKpc: number;
  vRadialKms: number;
  vTangentialKms: number;
};

export type HaloGalaxyInfallSettings = {
  host: NfwComponentSpec;
  haloMode: HaloMode;
  galDm: NfwComponentSpec;
  galStar: NfwComponentSpec;
  launch: LaunchSpec;
  epsDmDmKpc: number;
  epsStarKpc: number;
  fieldHalfWidthKpc: number;
  timeRateMyrPerSec: number;
  showWakeOverlay: boolean;
};

export type ParticleSnapshot = {
  positionKpc: Vec2;
  velocityKms: Vec2;
  massMsun: number;
  species: Species;
  overdensity: number;
};

export type DiagnosticPoint = {
  tMyr: number;
  rHalfStar: number;
  rHalfDm: number;
  boundFractionStar: number;
  boundFractionDm: number;
};

export type HaloGalaxyInfallSnapshot = {
  width: number;
  height: number;
  centerPx: Vec2;
  kpcPerPixel: number;
  particles: ParticleSnapshot[];
  comGalPosKpc: Vec2;
  comStarPosKpc: Vec2;
  comDmPosKpc: Vec2;
  diagnostics: DiagnosticPoint[];
  comTrailPx: Vec2[];
  hostDerived: {
    rho0MsunPerKpc3: number;
    rsKpc: number;
    rVirKpc: number;
    mDmVirMsun: number;
  };
  counts: {
    hostDm: number;
    galDm: number;
    galStar: number;
  };
  tMyr: number;
};
