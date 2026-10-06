import { useEffect, useMemo, useRef, useState } from "react";
import { setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import { useCanvasBackingStore } from "../../ui/stage/hooks";
import {
  StageDivider,
  StageHero,
  StageIconButton,
  StagePillButton,
  StagePills,
  StageReadout,
  StageSection,
  StageSelect,
  StageSlider,
  StageToggle
} from "../../ui/stage/StageControls";
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
import { createHaloGalaxyInfallSim, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./sim";
import type { DiagnosticPoint, HaloMode } from "./types";
import {
  isMp4SupportedSync,
  startCanvasRecording,
  type CanvasRecorder,
  type RecorderFormat,
  type RecorderStatus
} from "../../core/canvasRecorder";
import "./haloGalaxyInfallStage.css";

type HaloGalaxyInfallCanvasProps = {
  host?: AppletHostAdapter;
};

const LOG_M_HOST_MIN = Math.log10(1e11);
const LOG_M_HOST_MAX = Math.log10(5e12);
const LOG_M_GAL_DM_MIN = Math.log10(1e8);
const LOG_M_GAL_DM_MAX = Math.log10(5e10);
const LOG_M_GAL_STAR_MIN = Math.log10(1e7);
const LOG_M_GAL_STAR_MAX = Math.log10(5e9);

/** Logical size of each inset plot (drawn crisp at device resolution). */
const PLOT_W = 300;
const PLOT_H = 100;

/** Readout text refreshes a few times per second; the canvases redraw every frame. */
const READOUT_INTERVAL_MS = 150;

/** Plot and readout colours for the two galaxy components (match the particle colours). */
const STAR_COLOR = "rgb(255, 210, 120)";
const DM_COLOR = "rgb(120, 240, 200)";

const TIP = {
  play: "Start the infall, or pause and resume it. Display, softening and time-rate settings work while running.",
  reset: "Stop and rebuild the initial conditions from the current settings.",
  applyIc: "Rebuild the initial conditions with the changed settings; a running simulation keeps going.",
  record: "Record a video of the experiment, one frame per cadence step of simulation time.",
  stopRecording: "Stop recording and download the file.",
  cancelRecording: "Discard the recording without downloading.",
  mode: "Live N-body host: the halo is made of particles that respond to the galaxy (wake, dynamical friction).\nFixed analytic NFW: a smooth, unmoving potential; no host particles.\nSwitching applies at once.",
  hostMass: "Host dark-matter mass inside the virial radius.",
  hostRvir: "Host virial radius; the host is sampled out to here.",
  hostC: "Host concentration: higher c puts more mass near the centre (smaller scale radius r_s).",
  hostMp:
    "Target mass of each host DM particle. Heavier particles: fewer of them, faster but noisier.\nN = round(M/m), capped; when capped, m_eff is larger than the target.",
  galDmM: "Dark-matter mass of the infalling galaxy.",
  galDmRt: "Truncation radius of the galaxy's DM halo; nothing is sampled beyond it.",
  galDmC: "Concentration of the galaxy's DM profile (r_t / r_s).",
  galDmMp: "Target mass of each galaxy DM particle.\nN = round(M/m), capped; when capped, m_eff is larger than the target.",
  galStarM: "Stellar mass of the infalling galaxy.",
  galStarRt: "Truncation radius of the stellar component.",
  galStarC: "Concentration of the stellar profile (r_t / r_s).",
  galStarMp: "Target mass of each star particle.\nN = round(M/m), capped; when capped, m_eff is larger than the target.",
  rStart: "Starting distance of the galaxy's centre of mass, along +x from the host centre.",
  vRadial: "Initial galaxy velocity along x; negative heads towards the host.",
  vTan: "Initial galaxy velocity along +y; sets the orbit's angular momentum.",
  epsDm: "Softening length for DM–DM pairs (also softens the fixed NFW centre). Applies at once.",
  epsStar: "Softening length for star–star and star–DM pairs. Applies at once.",
  timeRate: "Simulated Myr per real second.",
  fieldHalfWidth: "Half-width of the view (zoom).",
  wake: "Colour host DM by overdensity relative to the average at the same distance from the galaxy: orange denser, blue sparser. Live host only.",
  vvec: "Draw each galaxy particle's velocity.",
  comTrail: "Trace the path of the galaxy's centre of mass.",
  presetEqual: "Every species at 4e7 M☉ per particle; total masses unchanged. Press Apply IC (or Reset) to rebuild.",
  presetCosmo: "DM at 4e7 M☉, stars at 4e6 M☉ per particle; total masses unchanged. Press Apply IC (or Reset) to rebuild.",
  cadence: "Simulated time between captured frames; playback is 30 fps.",
  maxFrames: "Recording stops automatically after this many frames.",
  time: "Simulated time since the start.",
  distance: "Distance of the galaxy's centre of mass from the host centre.",
  boundStars: "Share of the stars bound to the galaxy alone (galaxy-only potential, galaxy COM frame).",
  boundDm: "Share of the galaxy's DM bound to the galaxy alone (galaxy-only potential, galaxy COM frame).",
  rHalfStars: "Radius around the galaxy COM holding half of the stellar mass.",
  rHalfDm: "Radius around the galaxy COM holding half of the galaxy's DM mass.",
  hostCount: "Host DM particles (none with the fixed analytic NFW).",
  galDmCount: "Galaxy DM particles.",
  galStarCount: "Star particles.",
  recording: "Frames captured so far and the output format.",
  rHalfPlot: "Half-mass radius of galaxy stars vs gal DM (relative to galaxy COM).",
  boundPlot: "Bound fraction (galaxy-only potential in COM frame)."
} as const;

const MODE_OPTIONS: { value: HaloMode; label: string }[] = [
  { value: "live", label: "Live N-body host" },
  { value: "fixed_nfw", label: "Fixed analytic NFW" }
];

const FORMAT_OPTIONS: { value: RecorderFormat; label: string }[] = [
  { value: "auto", label: "Auto (MP4 if available, else WebP-zip)" },
  { value: "mp4", label: "MP4 (H.264, WebCodecs)" },
  { value: "webp-zip", label: "WebP frames in .zip" },
  { value: "png-zip", label: "PNG frames in .zip" }
];

type LiveReadouts = {
  tMyr: number;
  distanceKpc: number;
  counts: { hostDm: number; galDm: number; galStar: number };
  latest: DiagnosticPoint | null;
};

function formatMsun(m: number): string {
  return `${m.toExponential(2)} M☉`;
}

function formatKpc(v: number): string {
  if (!Number.isFinite(v)) {
    return "–";
  }
  return v >= 100 ? `${v.toFixed(0)} kpc` : v >= 10 ? `${v.toFixed(1)} kpc` : `${v.toFixed(2)} kpc`;
}

function formatPercent(f: number): string {
  return Number.isFinite(f) ? `${Math.round(f * 100)}%` : "–";
}

/** Display for a particle-mass slider: resulting N, effective mass, and the cap if it applies. */
function particleDisplay(p: { count: number; effectivePartMsun: number; capped: boolean }, cap: number): string {
  return (
    `N = ${p.count}` +
    (p.count > 0 ? ` · m_eff = ${formatMsun(p.effectivePartMsun)}` : "") +
    (p.capped ? ` (cap ${cap.toLocaleString()})` : "")
  );
}

function particleMassLabel(name: string, totalMsun: number): string {
  return `Target ${name} (M☉), ${M_PART_MIN_MSUN.toExponential(0)}–${Math.min(M_PART_MAX_MSUN, totalMsun).toExponential(0)}`;
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

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
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

  const [live, setLive] = useState<LiveReadouts | null>(null);
  const tMyrRef = useRef(0);

  const recorderRef = useRef<CanvasRecorder | null>(null);
  /** Fixed-size copy of the scene that the recorder reads (see onStartRecording). */
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastStatusUpdateMsRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [recCadenceMyr, setRecCadenceMyr] = useState(2);
  const [recFormat, setRecFormat] = useState<RecorderFormat>("auto");
  const [recMaxFrames, setRecMaxFrames] = useState(1500);
  const [recStatus, setRecStatus] = useState<RecorderStatus | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const mp4Supported = useMemo(() => isMp4SupportedSync(), []);

  const reducedMotion = host?.readReducedMotion?.() ?? false;

  const sim = useMemo(() => createHaloGalaxyInfallSim(defaultHaloGalaxyInfallSettings()), []);

  // The plots redraw every animation frame, so a resize needs no extra repaint.
  useCanvasBackingStore([rHalfPlotRef, boundPlotRef]);

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
    let lastReadout = -Infinity;
    let raf = 0;
    const tick = (time: number): void => {
      const dt = (time - last) / 1000;
      last = time;
      if (running && !paused) {
        sim.step(dt);
      }
      const snap = sim.getSnapshot();
      setLogicalTransform(ctx, LOGICAL_WIDTH);
      renderHaloGalaxyInfall(ctx, snap, {
        showWakeOverlay: showWake,
        showVelocityVectors: showVVec,
        showComTrail
      });

      const rCtx = rHalfPlotRef.current?.getContext("2d");
      if (rCtx) {
        setLogicalTransform(rCtx, PLOT_W);
        renderRHalfPlot(rCtx, PLOT_W, PLOT_H, snap.diagnostics);
      }
      const bCtx = boundPlotRef.current?.getContext("2d");
      if (bCtx) {
        setLogicalTransform(bCtx, PLOT_W);
        renderBoundFractionPlot(bCtx, PLOT_W, PLOT_H, snap.diagnostics);
      }

      tMyrRef.current = snap.tMyr;
      const rec = recorderRef.current;
      if (rec) {
        copyToRecordCanvas(canvas, recordCanvasRef.current);
        rec.maybeCaptureFrame(snap.tMyr);
        const st = rec.status();
        if (st.errorMessage) {
          setRecError(st.errorMessage);
          setRecStatus(st);
          recorderRef.current = null;
          setRecording(false);
          lastStatusUpdateMsRef.current = 0;
        } else if (time - lastStatusUpdateMsRef.current > 250) {
          lastStatusUpdateMsRef.current = time;
          setRecStatus(st);
        }
      }

      if (time - lastReadout > READOUT_INTERVAL_MS) {
        lastReadout = time;
        setLive({
          tMyr: snap.tMyr,
          distanceKpc: Math.hypot(snap.comGalPosKpc.x, snap.comGalPosKpc.y),
          counts: snap.counts,
          latest: snap.diagnostics[snap.diagnostics.length - 1] ?? null
        });
      }
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
    setRecording(false);
  }

  function onPlayPause(): void {
    if (!running) {
      setRunning(true);
      setPaused(false);
    } else {
      setPaused((p) => !p);
    }
  }

  function onReset(): void {
    setRunning(false);
    setPaused(false);
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

  /**
   * The stage canvas is sized to device pixels, which can be odd or larger than the H.264
   * level the recorder probes for, and can change mid-recording (resize, full screen).
   * Recording a fixed 900×620 copy keeps every format working at a stable size.
   */
  function recordingCanvas(): HTMLCanvasElement {
    let c = recordCanvasRef.current;
    if (!c) {
      c = document.createElement("canvas");
      c.width = LOGICAL_WIDTH;
      c.height = LOGICAL_HEIGHT;
      recordCanvasRef.current = c;
    }
    return c;
  }

  function onStartRecording(): void {
    if (recorderRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRecError(null);
    const target = recordingCanvas();
    copyToRecordCanvas(canvas, target);
    const rec = startCanvasRecording({
      canvas: target,
      format: recFormat,
      cadenceSimUnits: Math.max(0.05, recCadenceMyr),
      startSimTime: tMyrRef.current,
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
    setRecording(true);
    setRecStatus(rec.status());
  }

  async function onStopRecording(): Promise<void> {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setRecording(false);
    setRecStatus(rec.status());
    try {
      await rec.stopAndDownload();
    } catch (err) {
      setRecError(err instanceof Error ? err.message : String(err));
    }
    setRecStatus(rec.status());
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

  /** Setting changes that only take effect after the initial conditions are rebuilt. */
  function icSetter(set: (v: number) => void): (v: number) => void {
    return (v) => {
      set(v);
      setIcDirty(true);
    };
  }

  const mHostSlider = (Math.log10(hostMass) - LOG_M_HOST_MIN) / (LOG_M_HOST_MAX - LOG_M_HOST_MIN);
  const mGalDmSlider = (Math.log10(galDmM) - LOG_M_GAL_DM_MIN) / (LOG_M_GAL_DM_MAX - LOG_M_GAL_DM_MIN);
  const mGalStarSlider =
    (Math.log10(galStarM) - LOG_M_GAL_STAR_MIN) / (LOG_M_GAL_STAR_MAX - LOG_M_GAL_STAR_MIN);

  const moving = running && !paused;
  const playLabel = moving ? "Pause" : running ? "Resume" : "Start";

  const toolbar = (
    <>
      <StageIconButton icon={moving ? "pause" : "play"} label={playLabel} tip={TIP.play} onClick={onPlayPause} />
      <StageIconButton icon="reset" label="Reset" tip={TIP.reset} onClick={onReset} />
      {icDirty ? <StagePillButton label="Apply IC" tip={TIP.applyIc} onClick={onApplyIc} /> : null}
      <StageDivider />
      {recording ? (
        <>
          <StageIconButton
            icon="stop"
            label="Stop & download"
            tip={TIP.stopRecording}
            onClick={() => {
              void onStopRecording();
            }}
          />
          <StageIconButton icon="trash" label="Cancel" tip={TIP.cancelRecording} onClick={cancelRecording} />
        </>
      ) : (
        <StageIconButton icon="record" label="Start recording" tip={TIP.record} onClick={onStartRecording} />
      )}
    </>
  );

  const controls = (
    <>
      <StagePills>
        <StageToggle label="Wake overdensity (host DM)" on={showWake} tip={TIP.wake} onChange={setShowWake} />
        <StageToggle label="Galaxy velocity vectors" on={showVVec} tip={TIP.vvec} onChange={setShowVVec} />
        <StageToggle label="COM trail" on={showComTrail} tip={TIP.comTrail} onChange={setShowComTrail} />
      </StagePills>

      <StageSection title="Host DM halo">
        <StageSelect label="Mode" value={haloMode} options={MODE_OPTIONS} tip={TIP.mode} onChange={setHaloMode} />
        <StageSlider
          label="M_DM(r_vir)"
          display={formatMsun(hostMass)}
          value={finiteOr(mHostSlider, 0.5)}
          min={0}
          max={1}
          step={0.002}
          tip={TIP.hostMass}
          onChange={icSetter((t) => setHostMass(10 ** (LOG_M_HOST_MIN + t * (LOG_M_HOST_MAX - LOG_M_HOST_MIN))))}
        />
        <StageSlider
          label="r_vir"
          display={`${Math.round(hostRvir)} kpc`}
          value={hostRvir}
          min={80}
          max={300}
          step={5}
          tip={TIP.hostRvir}
          onChange={icSetter(setHostRvir)}
        />
        <StageSlider
          label="c = r_vir / r_s"
          display={hostC.toFixed(1)}
          value={hostC}
          min={4}
          max={20}
          step={0.5}
          tip={TIP.hostC}
          onChange={icSetter(setHostC)}
        />
        <StageSlider
          label={particleMassLabel("m_dm", hostMass)}
          display={particleDisplay(hostParticles, N_HOST_CAP)}
          value={finiteOr(targetMassSliderT(hostMass, hostMpMsun), 0)}
          min={0}
          max={1}
          step={0.001}
          tip={TIP.hostMp}
          onChange={icSetter((t) => setHostMpMsun(targetMassFromSliderT(hostMass, t)))}
        />
      </StageSection>

      <StageSection title="Infalling galaxy — DM">
        <StageSlider
          label="M_gal_dm"
          display={formatMsun(galDmM)}
          value={finiteOr(mGalDmSlider, 0.5)}
          min={0}
          max={1}
          step={0.003}
          tip={TIP.galDmM}
          onChange={icSetter((t) => setGalDmM(10 ** (LOG_M_GAL_DM_MIN + t * (LOG_M_GAL_DM_MAX - LOG_M_GAL_DM_MIN))))}
        />
        <StageSlider
          label="r_t (truncate)"
          display={`${galDmRt.toFixed(1)} kpc`}
          value={galDmRt}
          min={2}
          max={40}
          step={0.5}
          tip={TIP.galDmRt}
          onChange={icSetter(setGalDmRt)}
        />
        <StageSlider
          label="c_gal_dm"
          display={galDmC.toFixed(1)}
          value={galDmC}
          min={4}
          max={20}
          step={0.5}
          tip={TIP.galDmC}
          onChange={icSetter(setGalDmC)}
        />
        <StageSlider
          label={particleMassLabel("m_gal_dm", galDmM)}
          display={particleDisplay(galDmParticles, N_GAL_DM_CAP)}
          value={finiteOr(targetMassSliderT(galDmM, galDmMpMsun), 0)}
          min={0}
          max={1}
          step={0.001}
          tip={TIP.galDmMp}
          onChange={icSetter((t) => setGalDmMpMsun(targetMassFromSliderT(galDmM, t)))}
        />
      </StageSection>

      <StageSection title="Infalling galaxy — stars">
        <StageSlider
          label="M_gal_star"
          display={formatMsun(galStarM)}
          value={finiteOr(mGalStarSlider, 0.5)}
          min={0}
          max={1}
          step={0.003}
          tip={TIP.galStarM}
          onChange={icSetter((t) =>
            setGalStarM(10 ** (LOG_M_GAL_STAR_MIN + t * (LOG_M_GAL_STAR_MAX - LOG_M_GAL_STAR_MIN)))
          )}
        />
        <StageSlider
          label="r_t"
          display={`${galStarRt.toFixed(2)} kpc`}
          value={galStarRt}
          min={0.3}
          max={10}
          step={0.1}
          tip={TIP.galStarRt}
          onChange={icSetter(setGalStarRt)}
        />
        <StageSlider
          label="c_gal_star"
          display={galStarC.toFixed(1)}
          value={galStarC}
          min={4}
          max={20}
          step={0.5}
          tip={TIP.galStarC}
          onChange={icSetter(setGalStarC)}
        />
        <StageSlider
          label={particleMassLabel("m_star", galStarM)}
          display={particleDisplay(galStarParticles, N_GAL_STAR_CAP)}
          value={finiteOr(targetMassSliderT(galStarM, galStarMpMsun), 0)}
          min={0}
          max={1}
          step={0.001}
          tip={TIP.galStarMp}
          onChange={icSetter((t) => setGalStarMpMsun(targetMassFromSliderT(galStarM, t)))}
        />
      </StageSection>

      <StageSection title="Launch" defaultOpen={false}>
        <StageSlider
          label="R_start (+x from host center)"
          display={`${rStart.toFixed(0)} kpc`}
          value={rStart}
          min={20}
          max={280}
          step={5}
          tip={TIP.rStart}
          onChange={icSetter(setRStart)}
        />
        <StageSlider
          label="v_radial (km/s, +x)"
          display={`${vRadial.toFixed(0)} km/s`}
          value={vRadial}
          min={-300}
          max={300}
          step={5}
          tip={TIP.vRadial}
          onChange={icSetter(setVRadial)}
        />
        <StageSlider
          label="v_tangential (+y, km/s)"
          display={`${vTan.toFixed(0)} km/s`}
          value={vTan}
          min={-400}
          max={400}
          step={5}
          tip={TIP.vTan}
          onChange={icSetter(setVTan)}
        />
      </StageSection>

      <StageSection title="Particle-mass presets" defaultOpen={false}>
        <StagePills>
          <StagePillButton label="Equal mass (4e7 M☉)" tip={TIP.presetEqual} onClick={applyEqualMassPreset} />
          <StagePillButton
            label="Cosmo-like stars (DM 4e7, stars 4e6)"
            tip={TIP.presetCosmo}
            onClick={applyCosmoMassPreset}
          />
        </StagePills>
      </StageSection>

      <StageSection title="Numerics & view" defaultOpen={false}>
        <StageSlider
          label="ε_DM-DM (kpc)"
          display={`${epsDmDm.toFixed(2)} kpc`}
          value={epsDmDm}
          min={0.05}
          max={5}
          step={0.05}
          tip={TIP.epsDm}
          onChange={setEpsDmDm}
        />
        <StageSlider
          label="ε_star (star–star & star–DM)"
          display={`${epsStar.toFixed(2)} kpc`}
          value={epsStar}
          min={0.02}
          max={3}
          step={0.02}
          tip={TIP.epsStar}
          onChange={setEpsStar}
        />
        <StageSlider
          label="Time rate (Myr/s)"
          display={`${timeRate.toFixed(0)} Myr/s`}
          value={timeRate}
          min={5}
          max={100}
          step={1}
          tip={TIP.timeRate}
          onChange={setTimeRate}
        />
        <StageSlider
          label="Field half-width (kpc)"
          display={`${fieldHalfWidth.toFixed(0)} kpc`}
          value={fieldHalfWidth}
          min={30}
          max={300}
          step={5}
          tip={TIP.fieldHalfWidth}
          onChange={setFieldHalfWidth}
        />
      </StageSection>

      <StageSection title="Recording (sim-time paced)" defaultOpen={false}>
        <StageSlider
          label="Cadence"
          display={`${recCadenceMyr.toFixed(2)} Myr/frame`}
          value={recCadenceMyr}
          min={0.1}
          max={20}
          step={0.1}
          disabled={recording}
          tip={TIP.cadence}
          onChange={setRecCadenceMyr}
        />
        <StageSlider
          label="Max frames"
          display={String(recMaxFrames)}
          value={recMaxFrames}
          min={50}
          max={6000}
          step={50}
          disabled={recording}
          tip={TIP.maxFrames}
          onChange={setRecMaxFrames}
        />
        <StageSelect
          label="Format"
          value={recFormat}
          options={FORMAT_OPTIONS}
          disabled={recording}
          tip={mp4Supported ? "WebCodecs MP4 available" : "MP4 unsupported here"}
          onChange={setRecFormat}
        />
        {recError ? <p className="infall-rec-error">Recording error: {recError}</p> : null}
      </StageSection>
    </>
  );

  const latest = live?.latest ?? null;
  const readouts = live ? (
    <>
      <StageHero label="Time" value={`${live.tMyr.toFixed(1)} Myr`} tip={TIP.time} />
      <StageReadout label="Distance" value={formatKpc(live.distanceKpc)} tip={TIP.distance} />
      <StageReadout
        label="Bound stars"
        value={latest ? formatPercent(latest.boundFractionStar) : "–"}
        valueColor={STAR_COLOR}
        tip={TIP.boundStars}
      />
      <StageReadout
        label="Bound gal DM"
        value={latest ? formatPercent(latest.boundFractionDm) : "–"}
        valueColor={DM_COLOR}
        tip={TIP.boundDm}
      />
      <StageReadout
        label="r_half stars"
        value={latest ? formatKpc(latest.rHalfStar) : "–"}
        valueColor={STAR_COLOR}
        tip={TIP.rHalfStars}
      />
      <StageReadout
        label="r_half gal DM"
        value={latest ? formatKpc(latest.rHalfDm) : "–"}
        valueColor={DM_COLOR}
        tip={TIP.rHalfDm}
      />
      <StageReadout label="host_dm" value={live.counts.hostDm.toLocaleString()} muted tip={TIP.hostCount} />
      <StageReadout label="gal_dm" value={live.counts.galDm.toLocaleString()} muted tip={TIP.galDmCount} />
      <StageReadout label="gal_star" value={live.counts.galStar.toLocaleString()} muted tip={TIP.galStarCount} />
      {recError ? (
        <StageReadout label="Recording" value="error" valueColor="#ffb4a0" tip={recError} />
      ) : recStatus ? (
        <>
          <StageReadout
            label="Recording"
            value={`${recStatus.format} · ${recStatus.frameCount} frames`}
            valueColor={recording ? "#ff8a7a" : undefined}
            tip={TIP.recording}
          />
          {recStatus.estimatedBytes > 0 || recStatus.finalizing ? (
            <StageReadout
              label="Buffered"
              value={
                (recStatus.estimatedBytes > 0 ? `~${(recStatus.estimatedBytes / 1024 / 1024).toFixed(1)} MB` : "") +
                (recStatus.finalizing ? " · finalizing…" : "")
              }
            />
          ) : null}
        </>
      ) : null}
    </>
  ) : null;

  const inset = (
    <div className="infall-plots">
      <div title={TIP.rHalfPlot} data-hover-help={TIP.rHalfPlot}>
        <canvas
          ref={rHalfPlotRef}
          role="img"
          aria-label="Half-mass radius of stars and galaxy DM against time"
          style={{ width: PLOT_W, aspectRatio: `${PLOT_W} / ${PLOT_H}` }}
        />
      </div>
      <div title={TIP.boundPlot} data-hover-help={TIP.boundPlot}>
        <canvas
          ref={boundPlotRef}
          role="img"
          aria-label="Bound fraction of stars and galaxy DM against time"
          style={{ width: PLOT_W, aspectRatio: `${PLOT_W} / ${PLOT_H}` }}
        />
      </div>
    </div>
  );

  const info = (
    <>
      <h4>Reading the picture</h4>
      <ul>
        <li>
          Blue: host dark matter (live host only). Green: the galaxy&apos;s dark matter. Gold: its stars. Bigger dots
          are heavier particles.
        </li>
        <li>
          Gold ring: galaxy centre of mass (COM). Gold triangle: star COM. Green square: galaxy-DM COM. Faint gold
          line: COM trail.
        </li>
        <li>
          Orange dashed circles: 0.2, 0.5 and 1 r_vir of the host. Cyan dashed circle: its scale radius r_s; faint
          rings every r_s/2.
        </li>
        <li>
          Wake overdensity: host particles coloured by density relative to the average at the same distance from the
          galaxy COM (16 radial × 24 angular bins). Orange is denser, blue sparser.
        </li>
      </ul>
      <h4>Plots</h4>
      <ul>
        <li>Top: half-mass radius of galaxy stars vs gal DM, measured from the galaxy COM.</li>
        <li>
          Bottom: bound fraction, using the galaxy-only potential in the galaxy COM frame (kinetic + potential energy
          below zero); the host is left out. A point is added every 5 Myr.
        </li>
      </ul>
      <h4>Host halo</h4>
      <ul>
        <li>
          Live N-body host: the halo is made of particles that respond to the galaxy, so a wake and dynamical friction
          can develop.
        </li>
        <li>Fixed analytic NFW: a smooth, fixed NFW potential with the same M_DM(r_vir), r_vir and c.</li>
        <li>
          Switching applies at once: the host particles are removed, or a fresh host is sampled around the current
          galaxy.
        </li>
      </ul>
      <h4>Setting up a run</h4>
      <ul>
        <li>The galaxy starts at R_start on the +x axis, moving with v_radial along x and v_tangential along +y.</li>
        <li>
          Reset or Apply IC after changing masses, particle masses, halo shape, or launch. Softening, time rate, field
          width and display options act on the running simulation.
        </li>
        <li>
          Particle mass sliders use 1e6–1e9 M☉ per species (upper end clamped to each component total M). N = round(M/m)
          with performance caps (host {N_HOST_CAP.toLocaleString()}, gal DM {N_GAL_DM_CAP.toLocaleString()}, stars{" "}
          {N_GAL_STAR_CAP.toLocaleString()}); when capped, m_eff is larger than the target.
        </li>
        <li>Presets set the per-species target particle mass; total component masses are unchanged.</li>
      </ul>
      <h4>Model</h4>
      <ul>
        <li>
          2D analog of 3D NFW: each component is a truncated NFW (host to r_vir, galaxy parts to r_t), sampled from
          the 3D enclosed-mass profile and placed in the plane.
        </li>
        <li>Isotropic velocities with σ² = ½ v_c²: close to, not exactly, equilibrium, so there is a small initial breathing mode.</li>
        <li>
          Solver: 2D Barnes-Hut (θ = 0.7) with Plummer-softened gravity. Per-pair softening preserved (two trees: DM
          vs stars): ε_DM-DM for DM–DM pairs, ε_star for star–star and star–DM.
        </li>
      </ul>
      <h4>Recording</h4>
      <ul>
        <li>
          Frames are captured each time sim time advances by the cadence; playback is 30 fps. Recording stops
          automatically at max frames.
        </li>
        <li>
          Videos are {LOGICAL_WIDTH} × {LOGICAL_HEIGHT} px whatever the screen size.{" "}
          {mp4Supported ? "WebCodecs MP4 available." : "MP4 unsupported here."}
        </li>
      </ul>
    </>
  );

  return (
    <AppletStage
      logicalWidth={LOGICAL_WIDTH}
      logicalHeight={LOGICAL_HEIGHT}
      canvasRef={canvasRef}
      canvasLabel="A small galaxy of dark matter and stars falling through a host dark-matter halo"
      rootClassName="infall-stage"
      toolbar={toolbar}
      controls={controls}
      readouts={readouts}
      inset={inset}
      info={info}
      play={{ visible: !running || paused, label: playLabel, onClick: onPlayPause }}
    />
  );
}

/** Copy the stage canvas (device resolution) onto the fixed-size recording canvas. */
function copyToRecordCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement | null): void {
  const ctx = target?.getContext("2d");
  if (!target || !ctx) {
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, target.width, target.height);
}
