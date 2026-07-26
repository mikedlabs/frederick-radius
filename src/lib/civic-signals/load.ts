import "server-only";

import type { PublicCivicSignalsPayload } from "./contracts";
import trackedSeeClickFixAggregate from "./artifacts/seeclickfix-aggregate.json";
import {
  analyzeSeeClickFixAggregateArtifact,
  unavailableSeeClickFixAggregate,
} from "./artifact";
import { serializePublicCivicSignalsPayload } from "./serialize";

export type LoadCivicSignalsOptions = {
  now?: Date;
  /**
   * Test-only artifact reader. Production uses the statically imported,
   * tracked aggregate so Vercel cannot lose it during output tracing.
   */
  readArtifact?: () => Promise<unknown>;
};

/**
 * Load the tracked aggregate and return only the public contract.
 *
 * The ignored raw/clean pipeline folders are deliberately not consulted in
 * production. A missing artifact therefore becomes an explicit unavailable
 * state instead of a local-only signal that disappears after deployment.
 */
export async function loadCivicSignals(
  options: LoadCivicSignalsOptions = {},
): Promise<PublicCivicSignalsPayload> {
  const now = options.now ?? new Date();
  const readArtifact =
    options.readArtifact ??
    (async () => trackedSeeClickFixAggregate as unknown);

  let artifact: unknown;
  try {
    artifact = await readArtifact();
  } catch {
    const analysis = unavailableSeeClickFixAggregate({ now });
    return serializePublicCivicSignalsPayload(analysis, { now });
  }

  const analysis = analyzeSeeClickFixAggregateArtifact(artifact, { now });
  return serializePublicCivicSignalsPayload(analysis, { now });
}
