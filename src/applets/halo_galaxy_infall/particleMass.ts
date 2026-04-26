/** Per-particle mass range (M☉) for host DM, galaxy DM, and stars — UI and sampling. */
export const M_PART_MIN_MSUN = 1e6;
export const M_PART_MAX_MSUN = 1e9;

/** Performance caps on particle count (ideal N = round(M / m_target) is min(cap, …)). */
export const N_HOST_CAP = 1_000_000;
export const N_GAL_DM_CAP = 200_000;
export const N_GAL_STAR_CAP = 50_000;

/** Preset 1: equal mass for all species (chosen for a snappy interactive run). */
export const PRESET_EQUAL_MP_MSUN = 4e7;

/** Preset 2: cosmo-like — DM at 4e7, stars 10× lower. */
export const PRESET_COSMO_DM_MP_MSUN = 4e7;
export const PRESET_COSMO_STAR_MP_MSUN = 4e6;

export type ParticleCountResult = {
  count: number;
  /** Actual M / N after cap (equals target when not capped). */
  effectivePartMsun: number;
  capped: boolean;
};

/**
 * Uniform particle mass sampling: N = round(M_tot / m_target), capped.
 * Target mass is clamped to [M_PART_MIN_MSUN, M_PART_MAX_MSUN] and to ≤ M_tot.
 */
export function particleCountFromTargetMass(
  totalMsun: number,
  targetPartMsun: number,
  cap: number
): ParticleCountResult {
  if (totalMsun <= 0) {
    return { count: 0, effectivePartMsun: 0, capped: false };
  }
  const mT = Math.min(
    Math.max(targetPartMsun, M_PART_MIN_MSUN),
    M_PART_MAX_MSUN,
    totalMsun
  );
  const nIdeal = Math.max(0, Math.round(totalMsun / mT));
  if (nIdeal === 0) {
    return { count: 0, effectivePartMsun: 0, capped: false };
  }
  if (nIdeal > cap) {
    const n = cap;
    return { count: n, effectivePartMsun: totalMsun / n, capped: true };
  }
  return { count: nIdeal, effectivePartMsun: totalMsun / nIdeal, capped: false };
}
