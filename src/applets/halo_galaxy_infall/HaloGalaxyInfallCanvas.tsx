import { useEffect, useMemo, useRef, useState } from "react";
import { AppletHostAdapter } from "../../core/host";
import { ControlCard } from "../../ui/ControlCard";
import {
  DEFAULT_EPS_DM_DM_KPC,
  DEFAULT_EPS_STAR_KPC,
  DEFAULT_FIELD_HALF_WIDTH_KPC,
  DEFAULT_GAL_DM_C,
  DEFAULT_GAL_DM_M_MSUN,
  DEFAULT_GAL_DM_MP_MSUN,
  DEFAULT_GAL_DM_R_T_KPC,
  DEFAULT_GAL_STAR_C,
  DEFAULT_GAL_STAR_M_MSUN,
  DEFAULT_GAL_STAR_MP_MSUN,
  DEFAULT_GAL_STAR_R_T_KPC,
  DEFAULT_HALO_MODE,
  DEFAULT_HOST_C,
  DEFAULT_HOST_M_VIR_MSUN,
  DEFAULT_HOST_MP_MSUN,
  DEFAULT_HOST_R_VIR_KPC,
  DEFAULT_R_START_KPC,
  DEFAULT_SHOW_WAKE,
  DEFAULT_TIME_RATE_MYR_PER_SEC,
  DEFAULT_V_RADIAL_KMS,
  DEFAULT_V_TANGENTIAL_KMS,
  defaultHaloGalaxyInfallSettings
} from "./defaults";
import {
  M_PART_MAX_MSUN,
  M_PART_MIN_MSUN,
  N_GAL_DM_CAP,
  N_GAL_STAR_CAP,
  N_HOST_CAP,
  PRESET_COSMO_DM_MP_MSUN,
  PRESET_COSMO_STAR_MP_MSUN,
  PRESET_EQUAL_MP_MSUN,
  particleCountFromTargetMass
} from "./particleMass";
import { renderBoundFractionPlot, renderRHalfPlot } from "./diagnosticsPlot";
import { renderHaloGalaxyInfall } from "./render";
import { createHaloGalaxyInfallSim } from "./sim";
import type { HaloMode } from "./types";
import {
  isMp4SupportedSync,
  startCanvasRecording,
  type CanvasRecorder,
  type RecorderFormat,
  type RecorderStatus
} from "../../core/canvasRecorder";

type HaloGalaxyInfallCanvasProps = {
  host?: AppletHostAdapter;
};

const LOG_M_HOST_MIN = Math.log10(1e11);
const LOG_M_HOST_MAX = Math.log10(5e12);
const LOG_M_GAL_DM_MIN = Math.log10(1e8);
const LOG_M_GAL_DM_MAX = Math.log10(5e10);
const LOG_M_GAL_STAR_MIN = Math.log10(1e7);
const LOG_M_GAL_STAR_MAX = Math.log10(5e9);

const RPLOT_W = 900;
const RPLOT_H = 220;

function formatMsun(m: number): string {
  return `${m.toExponential(2)} M☉`;
}

/** Slider position in [0,1] for log-spaced particle mass up to min(M_PART_MAX, totalM). */
function targetMassSliderT(totalMsun: number, targetPartMsun: number): number {
  const mHi = Math.max(M_PART_MIN_MSUN * 1.000001, Math.min(M_PART_MAX_MSUN, totalMsun));
  const mLo = M_PART_MIN_MSUN;
  const mp = Math.min(Math.max(targetPartMsun, mLo), mHi);
  const t = (Math.log10(mp) - Math.log10(mLo)) / (Math.log10(mHi) - Math.log10(mLo));
  return Math.min(1, Math.max(0, t));
}

function targetMassFromSliderT(totalMsun: number, tRaw: number): number {
  const mHi = Math.max(M_PART_MIN_MSUN * 1.000001, Math.min(M_PART_MAX_MSUN, totalMsun));
  const mLo = M_PART_MIN_MSUN;
  const t = Math.min(1, Math.max(0, tRaw));
  return 10 ** (Math.log10(mLo) + t * (Math.log10(mHi) - Math.log10(mLo)));
}

export function HaloGalaxyInfallCanvas({ host }: HaloGalaxyInfallCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rHalfPlotRef = useRef<HTMLCanvasElement | null>(null);
  const boundPlotRef = useRef<HTMLCanvasElement | null>(null);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [icDirty, setIcDirty] = useState(false);

  const [hostMass, setHostMass] = useState(DEFAULT_HOST_M_VIR_MSUN);
  const [hostRvir, setHostRvir] = useState(DEFAULT_HOST_R_VIR_KPC);
  const [hostC, setHostC] = useState(DEFAULT_HOST_C);
  const [hostMpMsun, setHostMpMsun] = useState(DEFAULT_HOST_MP_MSUN);
  const [haloMode, setHaloMode] = useState<HaloMode>(DEFAULT_HALO_MODE);

  const [galDmM, setGalDmM] = useState(DEFAULT_GAL_DM_M_MSUN);
  const [galDmRt, setGalDmRt] = useState(DEFAULT_GAL_DM_R_T_KPC);
  const [galDmC, setGalDmC] = useState(DEFAULT_GAL_DM_C);
  const [galDmMpMsun, setGalDmMpMsun] = useState(DEFAULT_GAL_DM_MP_MSUN);

  const [galStarM, setGalStarM] = useState(DEFAULT_GAL_STAR_M_MSUN);
  const [galStarRt, setGalStarRt] = useState(DEFAULT_GAL_STAR_R_T_KPC);
  const [galStarC, setGalStarC] = useState(DEFAULT_GAL_STAR_C);
  const [galStarMpMsun, setGalStarMpMsun] = useState(DEFAULT_GAL_STAR_MP_MSUN);

  const [rStart, setRStart] = useState(DEFAULT_R_START_KPC);
  const [vRadial, setVRadial] = useState(DEFAULT_V_RADIAL_KMS);
  const [vTan, setVTan] = useState(DEFAULT_V_TANGENTIAL_KMS);

  const [epsDmDm, setEpsDmDm] = useState(DEFAULT_EPS_DM_DM_KPC);
  const [epsStar, setEpsStar] = useState(DEFAULT_EPS_STAR_KPC);
  const [fieldHalfWidth, setFieldHalfWidth] = useState(DEFAULT_FIELD_HALF_WIDTH_KPC);
  const [timeRate, setTimeRate] = useState(DEFAULT_TIME_RATE_MYR_PER_SEC);
  const [showWake, setShowWake] = useState(DEFAULT_SHOW_WAKE);
  const [showVVec, setShowVVec] = useState(false);
  const [showComTrail, setShowComTrail] = useState(true);

  const [counts, setCounts] = useState({ hostDm: 0, galDm: 0, galStar: 0 });
  const [tMyr, setTMyr] = useState(0);

  const recorderRef = useRef<CanvasRecorder | null>(null);
  const lastStatusUpdateMsRef = useRef(0);
  const [recCadenceMyr, setRecCadenceMyr] = useState(2);
  const [recFormat, setRecFormat] = useState<RecorderFormat>("auto");
  const [recMaxFrames, setRecMaxFrames] = useState(1500);
  const [recStatus, setRecStatus] = useState<RecorderStatus | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const mp4Supported = useMemo(() => isMp4SupportedSync(), []);

  const reducedMotion = host?.readReducedMotion?.() ?? false;

  const sim = useMemo(() => createHaloGalaxyInfallSim(defaultHaloGalaxyInfallSettings()), []);

  const hostParticles = useMemo(
    () => particleCountFromTargetMass(hostMass, hostMpMsun, N_HOST_CAP),
    [hostMass, hostMpMsun]
  );
  const galDmParticles = useMemo(
    () => particleCountFromTargetMass(galDmM, galDmMpMsun, N_GAL_DM_CAP),
    [galDmM, galDmMpMsun]
  );
  const galStarParticles = useMemo(
    () => particleCountFromTargetMass(galStarM, galStarMpMsun, N_GAL_STAR_CAP),
    [galStarM, galStarMpMsun]
  );

  useEffect(() => {
    const hi = Math.max(M_PART_MIN_MSUN * 1.000001, Math.min(M_PART_MAX_MSUN, hostMass));
    setHostMpMsun((mp) => Math.min(mp, hi));
  }, [hostMass]);
  useEffect(() => {
    const hi = Math.max(M_PART_MIN_MSUN * 1.000001, Math.min(M_PART_MAX_MSUN, galDmM));
    setGalDmMpMsun((mp) => Math.min(mp, hi));
  }, [galDmM]);
  useEffect(() => {
    const hi = Math.max(M_PART_MIN_MSUN * 1.000001, Math.min(M_PART_MAX_MSUN, galStarM));
    setGalStarMpMsun((mp) => Math.min(mp, hi));
  }, [galStarM]);

  useEffect(() => {
    if (reducedMotion) {
      setShowVVec(false);
      setShowComTrail(false);
      setTimeRate((tr) => Math.min(tr, 15));
    }
  }, [reducedMotion]);

  useEffect(() => {
    sim.setEpsDmDmKpc(epsDmDm);
  }, [epsDmDm, sim]);
  useEffect(() => {
    sim.setEpsStarKpc(epsStar);
  }, [epsStar, sim]);
  useEffect(() => {
    sim.setFieldHalfWidthKpc(fieldHalfWidth);
  }, [fieldHalfWidth, sim]);
  useEffect(() => {
    sim.setTimeRateMyrPerSec(timeRate);
  }, [timeRate, sim]);
  useEffect(() => {
    sim.setShowWakeOverlay(showWake);
  }, [showWake, sim]);
  useEffect(() => {
    sim.setHaloMode(haloMode);
  }, [haloMode, sim]);

  useEffect(() => {
    sim.setHostSpec({
      totalMassMsun: hostMass,
      rMaxKpc: hostRvir,
      concentration: hostC,
      count: hostParticles.count
    });
  }, [hostMass, hostRvir, hostC, hostParticles.count, sim]);
  useEffect(() => {
    sim.setGalDmSpec({
      totalMassMsun: galDmM,
      rMaxKpc: galDmRt,
      concentration: galDmC,
      count: galDmParticles.count
    });
  }, [galDmM, galDmRt, galDmC, galDmParticles.count, sim]);
  useEffect(() => {
    sim.setGalStarSpec({
      totalMassMsun: galStarM,
      rMaxKpc: galStarRt,
      concentration: galStarC,
      count: galStarParticles.count
    });
  }, [galStarM, galStarRt, galStarC, galStarParticles.count, sim]);
  useEffect(() => {
    sim.setLaunch({ rStartKpc: rStart, vRadialKms: vRadial, vTangentialKms: vTan });
  }, [rStart, vRadial, vTan, sim]);

  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec) {
        rec.cancel();
        recorderRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    let last = performance.now();
    let raf = 0;
    const tick = (time: number): void => {
      const dt = (time - last) / 1000;
      last = time;
      if (running && !paused) {
        sim.step(dt);
      }
      const snap = sim.getSnapshot();
      renderHaloGalaxyInfall(ctx, snap, {
        showWakeOverlay: showWake,
        showVelocityVectors: showVVec,
        showComTrail
      });

      const rCtx = rHalfPlotRef.current?.getContext("2d");
      if (rCtx) {
        renderRHalfPlot(rCtx, RPLOT_W, RPLOT_H, snap.diagnostics);
      }
      const bCtx = boundPlotRef.current?.getContext("2d");
      if (bCtx) {
        renderBoundFractionPlot(bCtx, RPLOT_W, RPLOT_H, snap.diagnostics);
      }

      const rec = recorderRef.current;
      if (rec) {
        rec.maybeCaptureFrame(snap.tMyr);
        const st = rec.status();
        if (st.errorMessage) {
          setRecError(st.errorMessage);
          setRecStatus(st);
          recorderRef.current = null;
          lastStatusUpdateMsRef.current = 0;
        } else if (time - lastStatusUpdateMsRef.current > 250) {
          lastStatusUpdateMsRef.current = time;
          setRecStatus(st);
        }
      }

      setCounts(snap.counts);
      setTMyr(snap.tMyr);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, running, showWake, showVVec, showComTrail, sim]);

  function cancelRecording(): void {
    const rec = recorderRef.current;
    if (rec) {
      rec.cancel();
      recorderRef.current = null;
      setRecStatus(null);
    }
  }

  function onReset(): void {
    sim.reset();
    setIcDirty(false);
    cancelRecording();
    host?.onResult?.({ event: "reset" });
  }

  function onApplyIc(): void {
    sim.reset();
    setIcDirty(false);
    cancelRecording();
  }

  function onStartRecording(): void {
    if (recorderRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRecError(null);
    const rec = startCanvasRecording({
      canvas,
      format: recFormat,
      cadenceSimUnits: Math.max(0.05, recCadenceMyr),
      startSimTime: tMyr,
      fps: 30,
      maxFrames: recMaxFrames,
      filenameStem: "halo_galaxy_infall",
      onError: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[recorder] error:", err);
        setRecError(msg);
      }
    });
    recorderRef.current = rec;
    setRecStatus(rec.status());
  }

  async function onStopRecording(): Promise<void> {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setRecStatus(rec.status());
    try {
      await rec.stopAndDownload();
    } catch (err) {
      setRecError(err instanceof Error ? err.message : String(err));
    }
    setRecStatus(rec.status());
  }

  function onCancelRecording(): void {
    cancelRecording();
  }

  function applyEqualMassPreset(): void {
    setHostMpMsun(PRESET_EQUAL_MP_MSUN);
    setGalDmMpMsun(PRESET_EQUAL_MP_MSUN);
    setGalStarMpMsun(PRESET_EQUAL_MP_MSUN);
    setIcDirty(true);
  }

  function applyCosmoMassPreset(): void {
    setHostMpMsun(PRESET_COSMO_DM_MP_MSUN);
    setGalDmMpMsun(PRESET_COSMO_DM_MP_MSUN);
    setGalStarMpMsun(PRESET_COSMO_STAR_MP_MSUN);
    setIcDirty(true);
  }

  const mHostSlider = (Math.log10(hostMass) - LOG_M_HOST_MIN) / (LOG_M_HOST_MAX - LOG_M_HOST_MIN);
  const mGalDmSlider = (Math.log10(galDmM) - LOG_M_GAL_DM_MIN) / (LOG_M_GAL_DM_MAX - LOG_M_GAL_DM_MIN);
  const mGalStarSlider =
    (Math.log10(galStarM) - LOG_M_GAL_STAR_MIN) / (LOG_M_GAL_STAR_MAX - LOG_M_GAL_STAR_MIN);

  const hostMpSliderT = targetMassSliderT(hostMass, hostMpMsun);
  const galDmMpSliderT = targetMassSliderT(galDmM, galDmMpMsun);
  const galStarMpSliderT = targetMassSliderT(galStarM, galStarMpMsun);

  return (
    <div className="gravity-layout">
      <ControlCard
        title="Galaxy infall through a DM halo"
        subtitle="2D N-body analog. Live host vs. fixed analytic NFW. Per-pair softening: ε_DM-DM vs ε_star (star-star and star-DM). Caveats on-panel."
      >
        <div className="control-grid">
          <div className="button-row control-span-2">
            <button type="button" onClick={() => setRunning(true)}>
              Start
            </button>
            <button type="button" onClick={() => setPaused((p) => !p)} disabled={!running}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={onReset}>
              Reset
            </button>
            {icDirty ? (
              <button type="button" onClick={onApplyIc}>
                Apply IC
              </button>
            ) : null}
          </div>

          <div className="stats control-span-2">
            <div>
              t = <strong>{tMyr.toFixed(1)}</strong> Myr · host_dm: <strong>{counts.hostDm}</strong> · gal_dm:{" "}
              <strong>{counts.galDm}</strong> · gal_star: <strong>{counts.galStar}</strong>
            </div>
          </div>

          <details className="control-section control-span-2">
            <summary>Particle-mass presets</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <div className="button-row control-span-2">
                <button type="button" onClick={applyEqualMassPreset}>
                  Equal mass (4e7 M☉)
                </button>
                <button type="button" onClick={applyCosmoMassPreset}>
                  Cosmo-like stars (DM 4e7, stars 4e6)
                </button>
              </div>
              <div className="control-span-2 subtle" style={{ fontSize: "0.82rem" }}>
                Sets the per-species target particle mass; total component masses are unchanged. Press
                Apply IC (or Reset) to rebuild the ICs at the new sampling.
              </div>
            </div>
          </details>

          <details className="control-section control-span-2" open>
            <summary>Recording (sim-time paced)</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <label>
                <span className="slider-label">
                  <span>Cadence</span>
                  <strong>{recCadenceMyr.toFixed(2)} Myr/frame</strong>
                </span>
                <input
                  type="range"
                  min={0.1}
                  max={20}
                  step={0.1}
                  value={recCadenceMyr}
                  onChange={(e) => setRecCadenceMyr(Number(e.target.value))}
                  disabled={!!recorderRef.current}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>Max frames</span>
                  <strong>{recMaxFrames}</strong>
                </span>
                <input
                  type="range"
                  min={50}
                  max={6000}
                  step={50}
                  value={recMaxFrames}
                  onChange={(e) => setRecMaxFrames(Number(e.target.value))}
                  disabled={!!recorderRef.current}
                />
              </label>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>Format</span>
                  <strong>{mp4Supported ? "WebCodecs MP4 available" : "MP4 unsupported here"}</strong>
                </span>
                <select
                  value={recFormat}
                  onChange={(e) => setRecFormat(e.target.value as RecorderFormat)}
                  disabled={!!recorderRef.current}
                >
                  <option value="auto">Auto (MP4 if available, else WebP-zip)</option>
                  <option value="mp4">MP4 (H.264, WebCodecs)</option>
                  <option value="webp-zip">WebP frames in .zip</option>
                  <option value="png-zip">PNG frames in .zip</option>
                </select>
              </label>
              <div className="button-row control-span-2">
                <button type="button" onClick={onStartRecording} disabled={!!recorderRef.current}>
                  Start recording
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onStopRecording();
                  }}
                  disabled={!recorderRef.current}
                >
                  Stop & download
                </button>
                <button
                  type="button"
                  onClick={onCancelRecording}
                  disabled={!recorderRef.current}
                >
                  Cancel
                </button>
              </div>
              <div className="control-span-2 subtle" style={{ fontSize: "0.82rem", lineHeight: 1.45 }}>
                {recStatus
                  ? `Format: ${recStatus.format} · frames: ${recStatus.frameCount}` +
                    (recStatus.estimatedBytes > 0
                      ? ` · ~${(recStatus.estimatedBytes / 1024 / 1024).toFixed(1)} MB buffered`
                      : "") +
                    (recStatus.finalizing ? " · finalizing…" : "")
                  : "Frames are captured each time sim time advances by the cadence; playback is 30 fps. Recording stops automatically at max frames."}
              </div>
              {recError ? (
                <div
                  className="control-span-2"
                  style={{
                    fontSize: "0.82rem",
                    lineHeight: 1.45,
                    color: "#ffb4a0",
                    background: "rgba(120, 40, 30, 0.25)",
                    padding: "0.4rem 0.6rem",
                    borderRadius: 6
                  }}
                >
                  Recording error: {recError}
                </div>
              ) : null}
            </div>
          </details>

          <details className="control-section control-span-2" open>
            <summary>Host DM halo</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>Mode</span>
                  <strong>{haloMode === "live" ? "Live N-body" : "Fixed NFW potential"}</strong>
                </span>
                <select
                  value={haloMode}
                  onChange={(e) => {
                    setHaloMode(e.target.value as HaloMode);
                  }}
                >
                  <option value="live">Live N-body host</option>
                  <option value="fixed_nfw">Fixed analytic NFW</option>
                </select>
              </label>

              <label className="control-span-2">
                <span className="slider-label">
                  <span>M_DM(r_vir)</span>
                  <strong>{formatMsun(hostMass)}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.002}
                  value={Number.isFinite(mHostSlider) ? mHostSlider : 0.5}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setHostMass(10 ** (LOG_M_HOST_MIN + t * (LOG_M_HOST_MAX - LOG_M_HOST_MIN)));
                    setIcDirty(true);
                  }}
                />
              </label>

              <label>
                <span className="slider-label">
                  <span>r_vir</span>
                  <strong>{Math.round(hostRvir)} kpc</strong>
                </span>
                <input
                  type="range"
                  min={80}
                  max={300}
                  step={5}
                  value={hostRvir}
                  onChange={(e) => {
                    setHostRvir(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>

              <label>
                <span className="slider-label">
                  <span>c = r_vir / r_s</span>
                  <strong>{hostC.toFixed(1)}</strong>
                </span>
                <input
                  type="range"
                  min={4}
                  max={20}
                  step={0.5}
                  value={hostC}
                  onChange={(e) => {
                    setHostC(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>

              <label className="control-span-2">
                <span className="slider-label">
                  <span>
                    Target m_dm (M☉), {M_PART_MIN_MSUN.toExponential(0)}–
                    {Math.min(M_PART_MAX_MSUN, hostMass).toExponential(0)}
                  </span>
                  <strong>
                    N = {hostParticles.count}
                    {hostParticles.count > 0
                      ? ` · m_eff = ${formatMsun(hostParticles.effectivePartMsun)}`
                      : ""}
                    {hostParticles.capped ? ` (cap ${N_HOST_CAP.toLocaleString()})` : ""}
                  </strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={Number.isFinite(hostMpSliderT) ? hostMpSliderT : 0}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setHostMpMsun(targetMassFromSliderT(hostMass, t));
                    setIcDirty(true);
                  }}
                />
              </label>
            </div>
          </details>

          <details className="control-section control-span-2" open>
            <summary>Infalling galaxy — DM</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>M_gal_dm</span>
                  <strong>{formatMsun(galDmM)}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.003}
                  value={Number.isFinite(mGalDmSlider) ? mGalDmSlider : 0.5}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setGalDmM(10 ** (LOG_M_GAL_DM_MIN + t * (LOG_M_GAL_DM_MAX - LOG_M_GAL_DM_MIN)));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>r_t (truncate)</span>
                  <strong>{galDmRt.toFixed(1)} kpc</strong>
                </span>
                <input
                  type="range"
                  min={2}
                  max={40}
                  step={0.5}
                  value={galDmRt}
                  onChange={(e) => {
                    setGalDmRt(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>c_gal_dm</span>
                  <strong>{galDmC.toFixed(1)}</strong>
                </span>
                <input
                  type="range"
                  min={4}
                  max={20}
                  step={0.5}
                  value={galDmC}
                  onChange={(e) => {
                    setGalDmC(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>
                    Target m_gal_dm (M☉), {M_PART_MIN_MSUN.toExponential(0)}–
                    {Math.min(M_PART_MAX_MSUN, galDmM).toExponential(0)}
                  </span>
                  <strong>
                    N = {galDmParticles.count}
                    {galDmParticles.count > 0
                      ? ` · m_eff = ${formatMsun(galDmParticles.effectivePartMsun)}`
                      : ""}
                    {galDmParticles.capped ? ` (cap ${N_GAL_DM_CAP.toLocaleString()})` : ""}
                  </strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={Number.isFinite(galDmMpSliderT) ? galDmMpSliderT : 0}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setGalDmMpMsun(targetMassFromSliderT(galDmM, t));
                    setIcDirty(true);
                  }}
                />
              </label>
            </div>
          </details>

          <details className="control-section control-span-2" open>
            <summary>Infalling galaxy — stars</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>M_gal_star</span>
                  <strong>{formatMsun(galStarM)}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.003}
                  value={Number.isFinite(mGalStarSlider) ? mGalStarSlider : 0.5}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setGalStarM(
                      10 ** (LOG_M_GAL_STAR_MIN + t * (LOG_M_GAL_STAR_MAX - LOG_M_GAL_STAR_MIN))
                    );
                    setIcDirty(true);
                  }}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>r_t</span>
                  <strong>{galStarRt.toFixed(2)} kpc</strong>
                </span>
                <input
                  type="range"
                  min={0.3}
                  max={10}
                  step={0.1}
                  value={galStarRt}
                  onChange={(e) => {
                    setGalStarRt(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>c_gal_star</span>
                  <strong>{galStarC.toFixed(1)}</strong>
                </span>
                <input
                  type="range"
                  min={4}
                  max={20}
                  step={0.5}
                  value={galStarC}
                  onChange={(e) => {
                    setGalStarC(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>
                    Target m_star (M☉), {M_PART_MIN_MSUN.toExponential(0)}–
                    {Math.min(M_PART_MAX_MSUN, galStarM).toExponential(0)}
                  </span>
                  <strong>
                    N = {galStarParticles.count}
                    {galStarParticles.count > 0
                      ? ` · m_eff = ${formatMsun(galStarParticles.effectivePartMsun)}`
                      : ""}
                    {galStarParticles.capped ? ` (cap ${N_GAL_STAR_CAP.toLocaleString()})` : ""}
                  </strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={Number.isFinite(galStarMpSliderT) ? galStarMpSliderT : 0}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setGalStarMpMsun(targetMassFromSliderT(galStarM, t));
                    setIcDirty(true);
                  }}
                />
              </label>
            </div>
          </details>

          <details className="control-section control-span-2">
            <summary>Launch</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <label>
                <span className="slider-label">
                  <span>R_start (+x from host center)</span>
                  <strong>{rStart.toFixed(0)} kpc</strong>
                </span>
                <input
                  type="range"
                  min={20}
                  max={280}
                  step={5}
                  value={rStart}
                  onChange={(e) => {
                    setRStart(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>v_radial (km/s, +x)</span>
                  <strong>{vRadial.toFixed(0)}</strong>
                </span>
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={5}
                  value={vRadial}
                  onChange={(e) => {
                    setVRadial(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
              <label className="control-span-2">
                <span className="slider-label">
                  <span>v_tangential (+y, km/s)</span>
                  <strong>{vTan.toFixed(0)}</strong>
                </span>
                <input
                  type="range"
                  min={-400}
                  max={400}
                  step={5}
                  value={vTan}
                  onChange={(e) => {
                    setVTan(Number(e.target.value));
                    setIcDirty(true);
                  }}
                />
              </label>
            </div>
          </details>

          <details className="control-section control-span-2">
            <summary>Numerics & view</summary>
            <div className="control-grid" style={{ marginTop: "0.65rem" }}>
              <label>
                <span className="slider-label">
                  <span>ε_DM-DM (kpc)</span>
                  <strong>{epsDmDm.toFixed(2)}</strong>
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={5}
                  step={0.05}
                  value={epsDmDm}
                  onChange={(e) => setEpsDmDm(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>ε_star (star–star & star–DM)</span>
                  <strong>{epsStar.toFixed(2)}</strong>
                </span>
                <input
                  type="range"
                  min={0.02}
                  max={3}
                  step={0.02}
                  value={epsStar}
                  onChange={(e) => setEpsStar(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>Time rate (Myr/s)</span>
                  <strong>{timeRate.toFixed(0)}</strong>
                </span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={timeRate}
                  onChange={(e) => setTimeRate(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="slider-label">
                  <span>Field half-width (kpc)</span>
                  <strong>{fieldHalfWidth.toFixed(0)}</strong>
                </span>
                <input
                  type="range"
                  min={30}
                  max={300}
                  step={5}
                  value={fieldHalfWidth}
                  onChange={(e) => setFieldHalfWidth(Number(e.target.value))}
                />
              </label>
            </div>
          </details>

          <div className="control-span-2">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showWake}
                onChange={(e) => setShowWake(e.target.checked)}
              />
              Wake overdensity (host DM)
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showVVec}
                onChange={(e) => setShowVVec(e.target.checked)}
              />
              Galaxy velocity vectors
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showComTrail}
                onChange={(e) => setShowComTrail(e.target.checked)}
              />
              COM trail
            </label>
          </div>

          <div className="control-span-2 subtle" style={{ fontSize: "0.82rem", lineHeight: 1.45 }}>
            2D analog of 3D NFW; isotropic velocities with σ² = ½ v_c² (small initial breathing mode). Solver:
            2D Barnes-Hut (θ = 0.7); per-pair softening preserved (two trees: DM vs stars). Particle mass sliders
            use 1e6–1e9 M☉ per species (upper end clamped to each component total M). N = round(M/m) with
            performance caps (host {N_HOST_CAP.toLocaleString()}, gal DM {N_GAL_DM_CAP.toLocaleString()}, stars{" "}
            {N_GAL_STAR_CAP.toLocaleString()}); when capped, m_eff is larger than the target. Reset or Apply IC after
            changing masses, particle masses, halo shape, or launch.
           
          </div>
        </div>
      </ControlCard>

      <div className="galaxy-outflow-visual-column">
        <div className="canvas-shell card">
          <canvas ref={canvasRef} width={900} height={620} />
        </div>
        <div className="canvas-shell card galaxy-outflow-density-plot">
          <div className="subtle" style={{ marginBottom: "0.45rem" }}>
            Half-mass radius of galaxy stars vs gal DM (relative to galaxy COM).
          </div>
          <canvas ref={rHalfPlotRef} width={RPLOT_W} height={RPLOT_H} />
        </div>
        <div className="canvas-shell card galaxy-outflow-density-plot">
          <div className="subtle" style={{ marginBottom: "0.45rem" }}>
            Bound fraction (galaxy-only potential in COM frame).
          </div>
          <canvas ref={boundPlotRef} width={RPLOT_W} height={RPLOT_H} />
        </div>
      </div>
    </div>
  );
}
