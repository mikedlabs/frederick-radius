import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARC_STATIONS } from "../src/data/marc-stations";
import {
  assertTransitValidation,
  validateFrederickTransitArtifacts,
  validateMarcScheduleArtifact,
} from "./lib/transit-data-validation";

function json(path: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
}

const mode = process.argv[2] ?? "--all";
if (!["--all", "--frederick", "--marc"].includes(mode)) {
  throw new Error(
    "Usage: npm run validate:transit-data -- [--all|--frederick|--marc]",
  );
}

if (mode === "--all" || mode === "--frederick") {
  assertTransitValidation(
    "Frederick TransIT",
    validateFrederickTransitArtifacts({
      transit: json("src/data/transit.json"),
      network: json("src/data/transit-network.json"),
      trips: json("src/data/transit-trips.json"),
    }),
  );
  console.log("Frederick TransIT data validation passed.");
}

if (mode === "--all" || mode === "--marc") {
  assertTransitValidation(
    "MARC schedule",
    validateMarcScheduleArtifact(
      json("src/data/marc-schedule.json"),
      MARC_STATIONS.flatMap((station) => [
        { id: station.stopIds.eb, lat: station.lat, lng: station.lng },
        { id: station.stopIds.wb, lat: station.lat, lng: station.lng },
      ]),
    ),
  );
  console.log("MARC schedule data validation passed.");
}
