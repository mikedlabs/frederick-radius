import "server-only";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";

import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";
import FairDayWorkspace from "./FairDayWorkspace";

/**
 * Server adapter for the canonical reviewed pack. It emits useful schedule,
 * offer, arrival, and source content before the client workspace hydrates.
 */
export default function FairDayPage({ asOf = new Date() }: { asOf?: Date }) {
  const data = buildFairDayWorkspaceData(
    greatFrederickFair2026Pack,
    greatFrederickFair2026PackPointer,
    asOf,
  );
  return <FairDayWorkspace data={data} />;
}
