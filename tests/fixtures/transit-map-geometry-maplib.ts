/** Test-only adapter. Never imported by application code or normal tests. */
import Mapbox from "mapbox-gl/dist/mapbox-gl.js";
import type { Map as GLMap } from "mapbox-gl";
import { transitGeometryEngine as engine } from "./transit-map-geometry-engine";

class FixtureMap extends Mapbox.Map {
  constructor(options: ConstructorParameters<typeof Mapbox.Map>[0]) {
    super({ ...options, testMode: true, accessToken: "" });
    engine.map = this as unknown as GLMap;
    engine.testModeApplied = true;
    this.on("error", (event) => engine.errors.push(event.error.message));
  }
}

// react-map-gl receives the complete genuine library API. Only construction
// adds Mapbox's documented local-test option and an empty account token.
const fixtureMapLib = { ...Mapbox, Map: FixtureMap };
export default fixtureMapLib;
