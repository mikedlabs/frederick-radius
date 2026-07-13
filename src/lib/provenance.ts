/**
 * Provenance: the data trust layer (data brief, Phase 1, section 4.1).
 *
 * Every place row that reaches a rendering surface carries these seven
 * fields, stamped at the loader chokepoint so coverage is total by
 * construction. Rendering decisions about visibility and badging key off
 * `confidence` and `last_verified_at`, never off ad hoc logic in
 * components.
 *
 * The confidence ladder, per the decision record:
 *   curated : a person at Frederick Radius placed or reviewed this row.
 *   partner : a partner organization's vetted feed (Downtown Frederick
 *              Partnership and, later, Visit Frederick).
 *   verified: an authoritative API confirms the listing (Google Places,
 *              county GIS).
 *   scraped : discovered programmatically and not yet reviewed by a
 *              person or confirmed by an authority. The OSM and discovery
 *              tail. Renders, but never leads a curated surface.
 *
 * Hours trust is deliberately separate (section 4.3): a place row being
 * `verified` says the listing exists, not that its hours are current.
 * Open and closed assertions key off `hours_verified` plus freshness.
 */

export type SourceConfidence = "curated" | "partner" | "verified" | "scraped";

export type Provenance = {
  /** Adapter or origin enum for the row ("seed", "dfp", "google", ...). */
  source: string;
  /** Stable identifier inside the source system. Falls back to the slug
   *  namespaced so it can never collide with a real external id. */
  source_id: string;
  /** URL of the source RECORD (not the business website). Null when the
   *  source has no stable public record URL. The field is always present
   *  so consumers can rely on its shape. */
  source_url: string | null;
  /** License or usage basis the row is held under. */
  license: string;
  confidence: SourceConfidence;
  /** When this row first entered the dataset. Backfilled rows that never
   *  recorded a creation date use the documented backfill epoch below. */
  first_seen_at: string;
  /** When the row was last checked against its source or by an editor. */
  last_verified_at: string;
};

/**
 * The backfill epoch: rows that predate provenance tracking and carry no
 * timestamp of their own are stamped with this date, which is the date of
 * the dataset's last full editorial pass. A documented constant is honest;
 * an invented per row date would not be.
 */
export const PROVENANCE_BACKFILL_EPOCH = "2026-05-14T00:00:00Z";

type SourceMeta = {
  license: string;
  confidence: SourceConfidence;
};

/**
 * Per source trust and license registry. `discovered` is the synthetic
 * source for rows that arrived through programmatic discovery with no
 * source field of their own (the 1,000 row tail in places-discovered).
 */
const SOURCE_REGISTRY: Record<string, SourceMeta> = {
  seed:       { license: "First party editorial",                          confidence: "curated" },
  manual:     { license: "First party editorial",                          confidence: "curated" },
  dfp:        { license: "Partner data, Downtown Frederick Partnership",   confidence: "partner" },
  google:     { license: "Google Places API terms",                        confidence: "verified" },
  arcgis:     { license: "Frederick County GIS open data",                 confidence: "verified" },
  "fc-gis":   { license: "Frederick County GIS open data",                 confidence: "verified" },
  yelp:       { license: "Yelp API terms",                                 confidence: "scraped" },
  discovered: { license: "Google Places API terms",                        confidence: "scraped" },
  osm:        { license: "ODbL, OpenStreetMap contributors",               confidence: "scraped" },
};

const FALLBACK_META: SourceMeta = {
  license: "Unknown origin, treat as unreviewed",
  confidence: "scraped",
};

/** The loose shape a raw place row presents before typing. The stamper
 *  accepts the union of what the three data files contain. */
export type ProvenanceInput = {
  slug: string;
  source?: string;
  google_place_id?: string;
  updated_at?: string;
  hours_updated_at?: string;
  last_verified_at?: string;
};

/**
 * Stamp the seven provenance fields for a place row.
 *
 * @param p the raw row
 * @param verifiedAt the effective verification date the loader computed
 *        for this row (enrichment sync date for enriched rows, editor
 *        date for curated rows). Falls back through the row's own
 *        timestamps to the backfill epoch.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True only for a real Google Places ID (ChIJ…, GhIJ…, Ei…), never a partner
 * UUID. Google IDs are opaque base64url tokens and are never UUID-shaped, so a
 * UUID in this field is a mis-stored partner identifier (DQ-020) that must not
 * be turned into a maps/place?q=place_id:<uuid> link.
 */
export function isGooglePlaceId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.length > 0 && !UUID_RE.test(id);
}

export function stampPlaceProvenance(
  p: ProvenanceInput,
  verifiedAt?: string,
): Provenance {
  const source = p.source ?? "discovered";
  const meta = SOURCE_REGISTRY[source] ?? FALLBACK_META;
  const source_id = p.google_place_id ?? `slug:${p.slug}`;
  // Google rows have a stable public record URL through the place id, but ONLY
  // when the id is actually a Google Places ID. 123 rows carry a partner
  // UUID in google_place_id (DQ-020), and maps/place?q=place_id:<uuid> resolves
  // to nothing — a broken "source" link that misrepresents provenance. Emit the
  // URL only for a conforming Google id; a UUID gets no fabricated link.
  const source_url = isGooglePlaceId(p.google_place_id)
    ? `https://www.google.com/maps/place/?q=place_id:${p.google_place_id}`
    : null;
  return {
    source,
    source_id,
    source_url,
    license: meta.license,
    confidence: meta.confidence,
    first_seen_at: p.updated_at ?? PROVENANCE_BACKFILL_EPOCH,
    last_verified_at:
      verifiedAt ??
      p.last_verified_at ??
      p.hours_updated_at ??
      p.updated_at ??
      PROVENANCE_BACKFILL_EPOCH,
  };
}

/** The seven field names, exported for the acceptance gate test. */
export const PROVENANCE_FIELDS = [
  "source",
  "source_id",
  "source_url",
  "license",
  "confidence",
  "first_seen_at",
  "last_verified_at",
] as const;

/**
 * Event source registry (4.1, event side). The trust mapping follows the
 * decision record and the Phase 4 source table: first party editorial is
 * curated; organization and venue feeds are partner; the county
 * government calendar and ticketed listings (Ticketmaster, Bandsintown)
 * are verified; anything unrecognized is scraped, never a guess.
 */
const EVENT_SOURCE_REGISTRY: Record<string, SourceMeta> = {
  seed:             { license: "First party editorial",                          confidence: "curated" },
  manual:           { license: "First party editorial",                          confidence: "curated" },
  dfp:              { license: "Partner feed, Downtown Frederick Partnership",   confidence: "partner" },
  celebrate:        { license: "Partner feed, Celebrate Frederick",              confidence: "partner" },
  hood:             { license: "Partner feed, Hood College",                     confidence: "partner" },
  "visit-frederick": { license: "Partner feed, Visit Frederick",                 confidence: "partner" },
  weinberg:         { license: "Venue feed, Weinberg Center",                    confidence: "partner" },
  delaplaine:       { license: "Venue feed, Delaplaine Arts Center",             confidence: "partner" },
  county:           { license: "Frederick County government calendar",           confidence: "verified" },
  fcpl:             { license: "Frederick County Public Libraries calendar",     confidence: "verified" },
  fcvfra:           { license: "Frederick County Volunteer Fire & Rescue Assoc.", confidence: "verified" },
  "city-frederick": { license: "City of Frederick calendar",                     confidence: "verified" },
  fair:             { license: "The Great Frederick Fair calendar",              confidence: "verified" },
  "mount-airy":     { license: "Town of Mount Airy calendar",                    confidence: "verified" },
  thurmont:         { license: "Town of Thurmont calendar",                      confidence: "verified" },
  parks:            { license: "Frederick County Parks & Recreation calendar",   confidence: "verified" },
  "heritage-frederick": { license: "Heritage Frederick (Historical Society)",    confidence: "partner" },
  monocacy:         { license: "Venue feed, Monocacy Brewing",                   confidence: "partner" },
  msd:              { license: "Maryland School for the Deaf calendar",          confidence: "verified" },
  "mount-st-marys": { license: "Mount St. Mary's University calendar",           confidence: "verified" },
  isf:              { license: "Islamic Society of Frederick public calendar",   confidence: "verified" },
  elc:              { license: "Evangelical Lutheran Church calendar",           confidence: "partner" },
  "civil-war-med":  { license: "National Museum of Civil War Medicine calendar", confidence: "partner" },
  "maryland-ensemble": { license: "Maryland Ensemble Theatre calendar",          confidence: "partner" },
  catoctin:         { license: "Catoctin Land Trust calendar",                   confidence: "partner" },
  fcc:              { license: "Frederick Community College calendar",           confidence: "verified" },
  ticketmaster:     { license: "Ticketmaster Discovery API terms",               confidence: "verified" },
  bandsintown:      { license: "Bandsintown API terms",                          confidence: "verified" },
  seatgeek:         { license: "SeatGeek Platform API terms",                     confidence: "verified" },
  eventbrite:       { license: "Eventbrite API terms, organizer-published",       confidence: "scraped" },
  "frederick-keys": { license: "MLB Stats API (statsapi.mlb.com), public",        confidence: "verified" },
};

export type EventProvenanceInput = {
  slug: string;
  source?: string;
  source_url?: string | null;
  last_verified_at?: string;
};

/** Event side of the stamp. Events have no external id retained beyond
 *  their source URL, so source_id is the namespaced slug. */
export function stampEventProvenance(
  e: EventProvenanceInput,
  verifiedAt?: string,
): Omit<Provenance, "source" | "source_url"> & { source_url: string | null } {
  const meta = EVENT_SOURCE_REGISTRY[e.source ?? ""] ?? FALLBACK_META;
  return {
    source_id: `slug:${e.slug}`,
    source_url: e.source_url ?? null,
    license: meta.license,
    confidence: meta.confidence,
    first_seen_at: e.last_verified_at ?? PROVENANCE_BACKFILL_EPOCH,
    last_verified_at: verifiedAt ?? e.last_verified_at ?? PROVENANCE_BACKFILL_EPOCH,
  };
}
