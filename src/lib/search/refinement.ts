import { MUNICIPALITIES } from "@/data/municipalities";

/** Used only when the reader explicitly changes the area control. Ordinary
 * queries keep their named destination ahead of a saved browsing scope. */
export function queryWithoutSearchArea(query: string): string {
  let result = query.replace(/\b(?:(?:in|near|around|by)\s+)?downtown(?:\s+frederick)?\b/gi, " ");
  for (const municipality of MUNICIPALITIES) {
    // Bare Frederick may be part of a business name or mean the county.
    const names = municipality.slug === "frederick"
      ? ["frederick city"]
      : [municipality.name, municipality.slug.replace(/-/g, " ")];
    for (const name of new Set(names)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`\\b(?:(?:in|near|around|by)\\s+)?${escaped}\\b`, "gi"), " ");
    }
  }
  // These are the same direction words recognized as county region scope.
  result = result.replace(/\b(?:(?:in|near|around|by|the)\s+)*(?:north|northern|west|western|east|eastern|south|southern|central)\b(?:\s+(?:part|parts|portion|portions|side|sides|area|areas)(?:\s+of)?)?(?:\s+(?:the\s+)?(?:frederick\s+)?county)?/gi, " ");
  return result.replace(/\s+/g, " ").trim().replace(/^[,?!.\s]+|[,?!.\s]+$/g, "");
}
