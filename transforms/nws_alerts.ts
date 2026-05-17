/**
 * NWS active alerts to a normalized tabular JSON payload of alerts that
 * mention Frederick.
 *
 * Zone alert geometry is frequently null, so emitting GeoJSON would
 * mostly produce null geometries. A tabular JSON list is the honest
 * representation here. The area filter is a text match on areaDesc
 * because that is the field that reliably names the county.
 */

import { isoDate, type TransformResult } from "../pipeline/lib/normalize";
import type { NwsAlertsRaw } from "../pipeline/schemas_ts/nws_alerts";

export function transform(raw: NwsAlertsRaw): TransformResult {
  const alerts = raw.features
    .map((f) => f.properties)
    .filter((p) => /frederick/i.test(p.areaDesc))
    .map((p) => ({
      external_id: p.id ?? "",
      event: p.event,
      severity: (p.severity ?? "Unknown").toLowerCase(),
      certainty: (p.certainty ?? "").toLowerCase(),
      urgency: (p.urgency ?? "").toLowerCase(),
      headline: p.headline ?? "",
      description: (p.description ?? "").slice(0, 600),
      area: p.areaDesc,
      effective_at: isoDate(p.effective),
      expires_at: isoDate(p.expires),
      source: "nws_alerts",
    }));

  return {
    format: "json",
    data: { source: "nws_alerts", count: alerts.length, alerts },
  };
}
