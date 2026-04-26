import {
  N_GAL_DM_CAP,
  N_GAL_STAR_CAP,
  N_HOST_CAP,
  particleCountFromTargetMass
} from "./particleMass";
import { HaloGalaxyInfallSettings } from "./types";

export const DEFAULT_HOST_M_VIR_MSUN = 1.2e12;
export const DEFAULT_HOST_R_VIR_KPC = 200;
export const DEFAULT_HOST_C = 12;
/** Target uniform particle mass (M☉); N = round(M_vir / m), capped. */
export const DEFAULT_HOST_MP_MSUN = 1e9;

export const DEFAULT_GAL_DM_M_MSUN = 9e9;
export const DEFAULT_GAL_DM_R_T_KPC = 15;
export const DEFAULT_GAL_DM_C = 10;
export const DEFAULT_GAL_DM_MP_MSUN = 1e8;

export const DEFAULT_GAL_STAR_M_MSUN = 1e9;
export const DEFAULT_GAL_STAR_R_T_KPC = 3;
export const DEFAULT_GAL_STAR_C = 12;
export const DEFAULT_GAL_STAR_MP_MSUN = 5e7;

export const DEFAULT_R_START_KPC = 100;
export const DEFAULT_V_RADIAL_KMS = -50;
export const DEFAULT_V_TANGENTIAL_KMS = 100;

export const DEFAULT_EPS_DM_DM_KPC = 1.0;
export const DEFAULT_EPS_STAR_KPC = 0.3;

export const DEFAULT_FIELD_HALF_WIDTH_KPC = 200;
export const DEFAULT_TIME_RATE_MYR_PER_SEC = 25;

export const DEFAULT_HALO_MODE = "live" as const;
export const DEFAULT_SHOW_WAKE = false;

export function defaultHaloGalaxyInfallSettings(): HaloGalaxyInfallSettings {
  const hostN = particleCountFromTargetMass(
    DEFAULT_HOST_M_VIR_MSUN,
    DEFAULT_HOST_MP_MSUN,
    N_HOST_CAP
  ).count;
  const galDmN = particleCountFromTargetMass(
    DEFAULT_GAL_DM_M_MSUN,
    DEFAULT_GAL_DM_MP_MSUN,
    N_GAL_DM_CAP
  ).count;
  const galStarN = particleCountFromTargetMass(
    DEFAULT_GAL_STAR_M_MSUN,
    DEFAULT_GAL_STAR_MP_MSUN,
    N_GAL_STAR_CAP
  ).count;

  return {
    host: {
      totalMassMsun: DEFAULT_HOST_M_VIR_MSUN,
      rMaxKpc: DEFAULT_HOST_R_VIR_KPC,
      concentration: DEFAULT_HOST_C,
      count: hostN
    },
    haloMode: DEFAULT_HALO_MODE,
    galDm: {
      totalMassMsun: DEFAULT_GAL_DM_M_MSUN,
      rMaxKpc: DEFAULT_GAL_DM_R_T_KPC,
      concentration: DEFAULT_GAL_DM_C,
      count: galDmN
    },
    galStar: {
      totalMassMsun: DEFAULT_GAL_STAR_M_MSUN,
      rMaxKpc: DEFAULT_GAL_STAR_R_T_KPC,
      concentration: DEFAULT_GAL_STAR_C,
      count: galStarN
    },
    launch: {
      rStartKpc: DEFAULT_R_START_KPC,
      vRadialKms: DEFAULT_V_RADIAL_KMS,
      vTangentialKms: DEFAULT_V_TANGENTIAL_KMS
    },
    epsDmDmKpc: DEFAULT_EPS_DM_DM_KPC,
    epsStarKpc: DEFAULT_EPS_STAR_KPC,
    fieldHalfWidthKpc: DEFAULT_FIELD_HALF_WIDTH_KPC,
    timeRateMyrPerSec: DEFAULT_TIME_RATE_MYR_PER_SEC,
    showWakeOverlay: DEFAULT_SHOW_WAKE
  };
}
