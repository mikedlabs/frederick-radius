import SOURCE_REGISTRY_RAW from "@/data/source-registry.generated.json" with { type: "json" };
import { approvedCountyHealthEndpoints } from "@/lib/integrations/fcCountyHealth";
import {
  HIGH_VALUE_SOURCE_ENDPOINTS,
  MARC_SOURCE_ENDPOINTS,
  RUNTIME_SOURCE_ENDPOINTS,
  type FeedHealthEndpoint,
} from "./feed-health";
import type { SourceManifestEntry } from "./source-ledger";

const SOURCE_REGISTRY = SOURCE_REGISTRY_RAW as SourceManifestEntry[];

/**
 * Keep persistence scoped to sources that are both active and request-time in
 * the canonical registry. This is the hard boundary that prevents a reachable
 * pipeline URL from being recorded as proof that transformed data published.
 */
export function selectActiveRuntimeProbeEndpoints(
  endpoints: readonly FeedHealthEndpoint[],
  registry: readonly Pick<
    SourceManifestEntry,
    "id" | "status" | "collection"
  >[],
): FeedHealthEndpoint[] {
  const activeRuntimeIds = new Set(
    registry
      .filter(
        (source) =>
          source.status === "active" && source.collection === "runtime",
      )
      .map((source) => source.id),
  );
  const seen = new Set<string>();

  return endpoints.filter((endpoint) => {
    const sourceId = endpoint.sourceId?.trim();
    if (!sourceId || !activeRuntimeIds.has(sourceId)) return false;
    const identity = `${sourceId}\n${endpoint.method ?? "GET"}\n${endpoint.url}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Build the low-cost runtime probe set at invocation time so County permission
 * settings and keyed-source configuration reflect the production deployment.
 */
export function runtimeSourceProbeEndpoints(): FeedHealthEndpoint[] {
  return selectActiveRuntimeProbeEndpoints(
    [
      ...MARC_SOURCE_ENDPOINTS,
      ...RUNTIME_SOURCE_ENDPOINTS,
      ...HIGH_VALUE_SOURCE_ENDPOINTS,
      ...approvedCountyHealthEndpoints(),
    ],
    SOURCE_REGISTRY,
  );
}
