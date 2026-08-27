/**
 * Explicit source-to-product declarations for checked-in artifacts. Paths are
 * evidence pointers for maintainers, not files to load through this registry.
 */
export type SourceArtifactConsumerContract = {
  sourceIds: readonly string[];
  powers: string;
  artifactPath: string;
  consumerPaths: readonly string[];
};

export const SOURCE_ARTIFACT_CONSUMERS: readonly SourceArtifactConsumerContract[] = [
  {
    sourceIds: ["business_info_extraction"],
    powers: "Published business details on place and reservation surfaces",
    artifactPath: "src/data/business-info.json",
    consumerPaths: [
      "src/app/(app)/places/[slug]/page.tsx",
      "src/app/(app)/reserve/page.tsx",
    ],
  },
  {
    sourceIds: ["municipal_civic_extraction"],
    powers: "Published municipal civic details on municipality, map, and Ask surfaces",
    artifactPath: "src/data/municipal-civic.json",
    consumerPaths: [
      "src/app/(app)/m/[municipality]/page.tsx",
      "src/components/map/AppMapSelectionSurfaces.tsx",
      "src/lib/ask/answer.ts",
    ],
  },
  {
    sourceIds: ["venue_event_extraction"],
    powers: "Published venue events in the shared Today and Events assembly",
    artifactPath: "src/data/venue-events.json",
    consumerPaths: ["src/lib/loaders/unifiedEvents.ts"],
  },
  {
    sourceIds: ["transit_gtfs"],
    powers: "Bus routes, stops, schedules, map geometry, and Ask answers",
    artifactPath: "src/data/transit.json",
    consumerPaths: [
      "src/app/(app)/transit/page.tsx",
      "src/components/transit/TransitMap.tsx",
      "src/lib/ask/answer.ts",
    ],
  },
  {
    sourceIds: ["census_tiger_county_boundary"],
    powers: "The published county boundary overlay and map frame",
    artifactPath: "public/overlays/county-boundary.geojson",
    consumerPaths: ["src/lib/integrations/fcGis.ts"],
  },
] as const;
