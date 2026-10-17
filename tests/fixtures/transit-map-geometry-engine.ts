import type { Map as GLMap } from "mapbox-gl";

/** Shared only by the opt-in fixture constructor and its browser test. */
export const transitGeometryEngine = {
  map: null as GLMap | null,
  errors: [] as string[],
  testModeApplied: false,
};
