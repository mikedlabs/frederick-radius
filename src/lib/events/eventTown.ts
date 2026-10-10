/** Town label for an event. Municipality data can prove that an event is in
 *  Frederick, but it cannot prove that it is downtown. Keep the broader label
 *  unless a future coordinate-backed downtown boundary supplies that evidence.
 *  Other towns pass through. Null when the town is unknown.
 *
 *  ONE implementation on purpose: the Today program rows and the TonightHeadline
 *  used to make this call separately, and the headline's copy drifted until the
 *  same city printed under two different names on one screen.
 *
 *  Updated 2026-10-06: Fall back to municipality field when municipality_name
 *  is missing (known data gap — ingest backfill is happening separately). */
export function eventTown(ev: {
  municipality_name?: string;
  municipality?: string;
}): string | null {
  const name = ev.municipality_name?.trim();
  if (name) return name;
  const fallback = ev.municipality?.trim();
  if (fallback) return fallback;
  return null;
}
