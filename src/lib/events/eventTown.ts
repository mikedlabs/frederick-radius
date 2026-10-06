import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/** Town label for an event. Municipality data can prove that an event is in
 *  Frederick, but it cannot prove that it is downtown. Keep the broader label
 *  unless a future coordinate-backed downtown boundary supplies that evidence.
 *  Other towns pass through. Null when the town is unknown.
 *
 *  ONE implementation on purpose: the Today program rows and the TonightHeadline
 *  used to make this call separately, and the headline's copy drifted until the
 *  same city printed under two different names on one screen. */
export function eventTown(ev: {
  municipality_name?: string;
  municipality?: string;
}): string | null {
  const t = ev.municipality_name?.trim();
  if (!t) return null;
  return t;
}

/**
 * Backfill municipality_name from municipality slug when missing.
 * Census (2026-10-06): public feed has municipality_name on all rows,
 * but defense: hydrate should never depend on only one field.
 */
export function backfillMunicipalityName(
  municipality?: string,
  municipality_name?: string,
): string {
  const name = municipality_name?.trim();
  if (name) return name;

  if (!municipality) return "";

  const record = MUNICIPALITY_BY_SLUG[municipality];
  return record?.name ?? "";
}
