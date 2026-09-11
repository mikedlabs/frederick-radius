import type { TransformResult } from "./normalize";

export function normalizedRowCount(result: TransformResult): number | null {
  const { data } = result;
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
    return record.features.length;
  }

  for (const key of ["periods", "items", "results", "records"]) {
    if (Array.isArray(record[key])) return record[key].length;
  }

  return null;
}
