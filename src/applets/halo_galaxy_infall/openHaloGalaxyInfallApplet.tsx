import { OpenAppletOptions, OpenedApplet } from "../../core/host";
import { HaloGalaxyInfallCanvas } from "./HaloGalaxyInfallCanvas";

export function openHaloGalaxyInfallApplet(options?: OpenAppletOptions): OpenedApplet {
  return {
    id: "halo-galaxy-infall",
    title: "Galaxy infall through a DM halo",
    description:
      "2D N-body: drop a truncated NFW galaxy (separate stars and DM) through a host halo. Toggle between live N-body host and fixed analytic NFW potential. Barnes-Hut gravity (θ=0.7) with per-pair softening (DM-DM vs star-anything). Target particle masses 1e6–1e9 M☉ per component (N = M/m, with caps).",
    close: () => {
      options?.host?.onClose?.();
    },
    render: () => <HaloGalaxyInfallCanvas host={options?.host} />
  };
}
