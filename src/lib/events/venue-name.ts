import { MUNICIPALITIES } from "@/data/municipalities";

// Name-only evidence stays independent of the place catalog and geometry.
export function normalizeEventVenueIdentity(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const GENERIC_EVENT_VENUE_IDENTITIES = new Set([
  ...MUNICIPALITIES.flatMap((municipality) => [
    normalizeEventVenueIdentity(municipality.name),
    normalizeEventVenueIdentity(municipality.slug),
  ]),
  "frederick",
  "frederickcounty",
  "frederickmd",
  "frederickmaryland",
  "maryland",
  "md",
  "downtown",
  "downtownfrederick",
  "county",
  "online",
  "virtual",
  "tbd",
]);

export function isGenericEventVenueName(value: string | null | undefined): boolean {
  const identity = normalizeEventVenueIdentity(value);
  return !identity || GENERIC_EVENT_VENUE_IDENTITIES.has(identity);
}
