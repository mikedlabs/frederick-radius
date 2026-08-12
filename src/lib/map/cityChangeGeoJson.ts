import type { MapLineFC } from "@/components/map/types";
import {
  CITY_CAPITAL_PROJECTS_SOURCE,
  CITY_DEVELOPMENT_REVIEW_SOURCE,
  type CityFrederickChangeRecord,
} from "@/lib/integrations/cityFrederickChanges";

type CityChangeProvenance = {
  checkedAt?: string;
  sourceStatus: "current" | "stale";
};

/**
 * Browser-safe change records for the existing planning overlay. Every
 * feature carries its own lifecycle language and provenance because this
 * collection can contain City capital projects, City review applications,
 * and County applications at the same time.
 */
export function cityChangeOverlayGeoJson(
  records: CityFrederickChangeRecord[],
  provenance: CityChangeProvenance,
): MapLineFC {
  return {
    type: "FeatureCollection",
    features: records.map((record) => {
      const source =
        record.kind === "capital_project"
          ? CITY_CAPITAL_PROJECTS_SOURCE
          : CITY_DEVELOPMENT_REVIEW_SOURCE;
      return {
        type: "Feature",
        geometry: record.geometry,
        properties: {
          id: record.id,
          name: record.name,
          record_kind: record.kind,
          popup_label:
            record.kind === "capital_project"
              ? "City capital project"
              : "City development review",
          status_label: record.statusLabel,
          lifecycle: record.lifecycle,
          construction_status: record.constructionStatus,
          ...(record.referenceId ? { reference_id: record.referenceId } : {}),
          ...(record.recordType ? { record_type: record.recordType } : {}),
          ...(record.reviewBody ? { review_body: record.reviewBody } : {}),
          ...(record.address ? { address: record.address } : {}),
          ...(record.district ? { district: record.district } : {}),
          ...(record.summary ? { summary: record.summary } : {}),
          ...(record.sourceStatus
            ? { source_status_label: record.sourceStatus }
            : {}),
          ...(record.sourceUpdatedAt
            ? { source_updated_at: record.sourceUpdatedAt }
            : {}),
          content_hash: record.contentHash,
          source_record_id: record.sourceRecordId,
          source_id: record.sourceId,
          source_label: source.authority,
          source_url: source.sourceUrl,
          source_status: provenance.sourceStatus,
          ...(provenance.checkedAt ? { checked_at: provenance.checkedAt } : {}),
          caveat: source.caveat,
        },
      };
    }),
  };
}
