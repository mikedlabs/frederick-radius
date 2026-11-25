import { duplicateNameQualifiers } from "@/lib/format/placeName";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * Three open "Food Lion" rows read identically on /open-now, because a row
 * prints no town. Only a name that repeats in the rows the page prints gets a
 * qualifier: the town's display name when that tells the stores apart, and
 * the street when two of them share a town. Pass exactly the rows the page
 * renders, so a store whose namesake is not on the page keeps a plain row.
 */
export function openNowNameQualifiers(
  rows: Parameters<typeof duplicateNameQualifiers>[0],
): Map<string, string> {
  return duplicateNameQualifiers(rows, (municipality) => MUNICIPALITY_BY_SLUG[municipality]?.name);
}
