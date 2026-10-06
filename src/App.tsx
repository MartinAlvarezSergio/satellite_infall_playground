import { useMemo } from "react";
import { openHaloGalaxyInfallApplet } from "./applets/halo_galaxy_infall/openHaloGalaxyInfallApplet";
import type { AppletHostAdapter } from "./core/host";

export function App(): JSX.Element {
  const host: AppletHostAdapter = useMemo(
    () => ({
      onClose: () => {},
      readReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }),
    []
  );

  const applet = useMemo(() => openHaloGalaxyInfallApplet({ host }), [host]);

  return (
    <div className="app-shell">
      <main className="modal card">{applet.render()}</main>
    </div>
  );
}
