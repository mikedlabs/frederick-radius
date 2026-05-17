/**
 * Frederick County Parks Trails (Cartegraph) to a normalized GeoJSON
 * FeatureCollection.
 *
 * Why geometry passes through: the source is queried with outSR=4326,
 * so coordinates are already WGS84, and trails are polylines the app
 * wants to draw as is. The transform only normalizes the attribute
 * bag: snake_case keys, an honest name, derived length in miles, a
 * boolean for the Yes/No flags, and an allowed-uses array. It is pure
 * and deterministic. ArcGIS bookkeeping (OBJECTID, editor fields,
 * Shape__Length) is dropped. A trail with no name is dropped rather
 * than given a fabricated one.
 */

import {
  toNumber,
  type GeoJson,
  type GeoFeature,
  type TransformResult,
} from "../pipeline/lib/normalize";
import type { FcParksTrailsRaw } from "../pipeline/schemas_ts/fc_parks_trails";

/**
 * ArcGIS stores these flags as free text ("Yes"/"No"/"Y"/"N"/null).
 * Map to a real boolean, or undefined when the source is silent — we
 * never assume a "No" the data did not state.
 */
function yesNo(v: string | null | undefined): boolean | undefined {
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  if (s === "" ) return undefined;
  if (s === "yes" || s === "y" || s === "true" || s === "allowed") return true;
  if (s === "no" || s === "n" || s === "false" || s === "not allowed") return false;
  return undefined;
}

function clean(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : undefined;
}

export function transform(raw: FcParksTrailsRaw): TransformResult {
  const features: GeoFeature[] = raw.features.flatMap((f): GeoFeature[] => {
    if (f.geometry == null) return [];
    const p = f.properties;
    const name = clean(p.Trail_Name) ?? clean(p.Park_Name);
    if (!name) return []; // no fabricated names

    const uses: string[] = [];
    if (yesNo(p.Hiking)) uses.push("hiking");
    if (yesNo(p.Road_Cycling)) uses.push("road_cycling");
    if (yesNo(p.Mtn_Biking)) uses.push("mountain_biking");
    if (yesNo(p.eBikes)) uses.push("ebikes");
    if (yesNo(p.Equestrian)) uses.push("equestrian");
    if (yesNo(p.Dogs_Allowed)) uses.push("dogs");
    if (yesNo(p.Motorcycles)) uses.push("motorcycles");

    const lengthFt = toNumber(p.Trail_Length_FT);
    const lengthMi =
      lengthFt != null && lengthFt > 0
        ? Math.round((lengthFt / 5280) * 100) / 100
        : undefined;

    return [
      {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          name,
          park: clean(p.Park_Name),
          trail_system: clean(p.Trail_System),
          description: clean(p.Trail_Desc),
          status: clean(p.Status),
          surface: clean(p.Surface_Type),
          paved: yesNo(p.Paved),
          ada_accessible: yesNo(p.ADA_Accessible),
          dogs_allowed: yesNo(p.Dogs_Allowed),
          allowed_uses: uses,
          length_mi: lengthMi,
          skill_level: clean(p.Trail_SkillLevel),
          trail_type: clean(p.Trail_Type),
          owned_by: clean(p.Owned_By),
          maintained_by: clean(p.Maintained_By),
          notes: clean(p.Notes),
          source: "fc_parks_trails",
        },
      },
    ];
  });

  const data: GeoJson = { type: "FeatureCollection", features };
  return { format: "geojson", data };
}
