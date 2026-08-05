/** Town label for an event. The City of Frederick reads "Downtown Frederick"
 *  (owner call, 2026-07-21: the dividing line is the city/county boundary, not
 *  the tight historic-core geofence — the East Frederick brewery corridor,
 *  Rockwell and Attaboy's taproom included, is downtown). The municipality slug
 *  already encodes that city-vs-county line, so any Frederick-city event carries
 *  the downtown label; other towns pass through. Null when the town is unknown.
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
  if (ev.municipality === "frederick") return "Downtown Frederick";
  return t;
}
