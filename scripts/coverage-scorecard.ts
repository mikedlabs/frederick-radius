/**
 * Generates docs/coverage-scorecard.md — a per-municipality coverage +
 * enrichment scorecard for the place dataset.
 *
 * Why: the app promises county-wide but the data centre of gravity is
 * Downtown Frederick (BACKLOG Cluster A, the P0 "never silently default to
 * downtown" directive). You can't manage what you can't measure — this makes
 * the bias and the gap-town thinness a committed, diffable number per release,
 * so a coverage push (or a regression) shows up in the report.
 *
 * Reads the slim client set (the same data every surface reads) + the
 * field-notes keyed by slug. Run with: npm run coverage:scorecard.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import places from "@/data/places-client.json" with { type: "json" };
import fieldNotes from "@/data/field-notes.json" with { type: "json" };
import enrichment from "@/data/places-enrichment.json" with { type: "json" };
import hoursRefresh from "@/data/places-hours-refresh.json" with { type: "json" };
import amenities from "@/data/amenities.json" with { type: "json" };
import { PLACES as SOURCE_PLACES } from "@/data/places";
import { EVENTS } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";
import { breweryMediaCoverage } from "@/lib/beer/brewery-media";
import { isHoursFresh } from "@/lib/hours-freshness";
import { isGooglePlaceId } from "@/lib/provenance";
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";
import {
  CORE_AMENITY_KINDS,
  summarizeAmenityCoverage,
  summarizeEventQuality,
  summarizeHoursRefreshArtifact,
} from "@/lib/quality/operator-coverage";
import { partitionEvents } from "@/lib/validation/placement";

type Place = {
  slug: string;
  municipality?: string;
  google_place_id?: string;
  google_rating?: number;
  hours?: Record<string, unknown> | null;
  hours_verified?: boolean;
  hours_updated_at?: string;
  google_photo_url?: string;
  local_favorite?: boolean;
};

const PLACES = places as unknown as Place[];
const NOTE_SLUGS = new Set(Object.keys(fieldNotes as Record<string, unknown>));
const SOURCE_BY_SLUG = new Map(
  SOURCE_PLACES.map((place) => [place.slug, place]),
);
const ENRICHMENT = enrichment as Record<
  string,
  {
    has_hours?: boolean;
    weekday_hours?: string[];
  }
>;

/** We may possess an old source schedule without being allowed to make a
 * current open-now claim. Keep that inventory metric separate from the strict
 * published-hours metric so a stale corpus cannot look user-ready. */
function hasStoredSchedule(place: Place): boolean {
  const source = SOURCE_BY_SLUG.get(place.slug);
  const entry = ENRICHMENT[place.slug];
  return Boolean(
    (source?.hours && Object.keys(source.hours).length > 0) ||
      (entry?.has_hours && entry.weekday_hours?.length),
  );
}

function hasPublishedFreshHours(place: Place): boolean {
  return Boolean(
    place.hours &&
      Object.keys(place.hours).length > 0 &&
      place.hours_verified &&
      isHoursFresh(place.hours_updated_at),
  );
}

// The 12 incorporated municipalities + Urbana — the canonical vocab. Anything
// else buckets under "(unincorporated / other)".
const MUNI_LABEL: Record<string, string> = {
  frederick: "Frederick",
  brunswick: "Brunswick",
  thurmont: "Thurmont",
  middletown: "Middletown",
  walkersville: "Walkersville",
  emmitsburg: "Emmitsburg",
  "new-market": "New Market",
  "mount-airy": "Mount Airy",
  myersville: "Myersville",
  woodsboro: "Woodsboro",
  burkittsville: "Burkittsville",
  rosemont: "Rosemont",
  urbana: "Urbana",
};
const OTHER = "(unincorporated / other)";

type Row = {
  muni: string;
  places: number;
  withStoredHours: number;
  withFreshHours: number;
  withRating: number;
  withPhoto: number;
  notes: number;
  favorites: number;
};

const byMuni = new Map<string, Row>();
const rowFor = (key: string): Row => {
  let r = byMuni.get(key);
  if (!r) {
    r = {
      muni: key,
      places: 0,
      withStoredHours: 0,
      withFreshHours: 0,
      withRating: 0,
      withPhoto: 0,
      notes: 0,
      favorites: 0,
    };
    byMuni.set(key, r);
  }
  return r;
};

for (const p of PLACES) {
  const key = p.municipality && MUNI_LABEL[p.municipality] ? MUNI_LABEL[p.municipality] : OTHER;
  const r = rowFor(key);
  r.places++;
  if (hasStoredSchedule(p)) r.withStoredHours++;
  if (hasPublishedFreshHours(p)) r.withFreshHours++;
  if (p.google_rating != null) r.withRating++;
  if (p.google_photo_url) r.withPhoto++;
  if (NOTE_SLUGS.has(p.slug)) r.notes++;
  if (p.local_favorite) r.favorites++;
}

const rows = [...byMuni.values()].sort((a, b) => b.places - a.places);
const total = rows.reduce(
  (t, r) => ({
    muni: "Total",
    places: t.places + r.places,
    withStoredHours: t.withStoredHours + r.withStoredHours,
    withFreshHours: t.withFreshHours + r.withFreshHours,
    withRating: t.withRating + r.withRating,
    withPhoto: t.withPhoto + r.withPhoto,
    notes: t.notes + r.notes,
    favorites: t.favorites + r.favorites,
  }),
  {
    muni: "Total",
    places: 0,
    withStoredHours: 0,
    withFreshHours: 0,
    withRating: 0,
    withPhoto: 0,
    notes: 0,
    favorites: 0,
  },
);

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
const line = (r: Row) =>
  `| ${r.muni} | ${r.places} | ${r.withStoredHours} (${pct(r.withStoredHours, r.places)}) | ${r.withFreshHours} (${pct(r.withFreshHours, r.places)}) | ${r.withRating} (${pct(r.withRating, r.places)}) | ${r.withPhoto} (${pct(r.withPhoto, r.places)}) | ${r.notes} | ${r.favorites} |`;

const googleBackedSlugs = new Set(
  PLACES.filter((place) => isGooglePlaceId(place.google_place_id)).map(
    (place) => place.slug,
  ),
);
const hoursArtifact = summarizeHoursRefreshArtifact(
  hoursRefresh as Record<string, unknown>,
  googleBackedSlugs,
);
const eventPlacement = partitionEvents(
  EVENTS,
  (slug) => SOURCE_BY_SLUG.get(slug)?.geom,
);
const eventQuality = summarizeEventQuality([
  ...eventPlacement.public,
  ...eventPlacement.needsReview,
]);
const amenityCoverage = summarizeAmenityCoverage(
  amenities as Amenity[],
  MUNICIPALITIES.map((municipality) => municipality.slug),
);
const breweryMedia = breweryMediaCoverage();

const amenityLabels: Record<AmenityKind, string> = {
  restroom: "Restroom",
  ev_charging: "EV",
  wifi: "Wi-Fi",
  bike_parking: "Bike parking",
  picnic: "Picnic",
  playground: "Playground",
  pool: "Pool",
  river_gauge: "River gauge",
  trash: "Trash",
  recycling: "Recycling",
  water: "Water",
  bench: "Bench",
  dog_waste: "Dog bags",
  dog_water: "Dog water",
  dog_park: "Dog park",
  water_access: "Water access",
  outlet: "Power",
  bike_repair: "Bike repair",
  other: "Other",
};
const amenityTownRows = MUNICIPALITIES.map((municipality) => {
  const values = amenityCoverage.byTownKind[municipality.slug] ?? {};
  return `| ${municipality.name} | ${CORE_AMENITY_KINDS.map((kind) => values[kind] ?? 0).join(" | ")} |`;
});
const eventCategories = Object.entries(eventQuality.categoryCounts)
  .map(([category, count]) => `${category}: ${count}`)
  .join(", ");

const md = [
  "# Coverage scorecard",
  "",
  "Per-municipality place coverage + enrichment depth, generated from the",
  "published client set, source schedules, enrichment, and field notes.",
  "A stored schedule is inventory; published fresh hours are the schedules",
  "currently allowed to support an open-now claim. Regenerate with",
  "`npm run coverage:scorecard`. The Downtown-Frederick centre of gravity",
  "(BACKLOG Cluster A) is the share of the dataset in the first row.",
  "",
  `_Generated ${new Date().toISOString().slice(0, 10)} — ${total.places} places._`,
  "",
  "| Municipality | Places | Stored schedule | Published fresh hours | With rating | Publishable photo | Field-notes | Local favorites |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map(line),
  `| **${total.muni}** | **${total.places}** | ${total.withStoredHours} (${pct(total.withStoredHours, total.places)}) | ${total.withFreshHours} (${pct(total.withFreshHours, total.places)}) | ${total.withRating} (${pct(total.withRating, total.places)}) | ${total.withPhoto} (${pct(total.withPhoto, total.places)}) | **${total.notes}** | **${total.favorites}** |`,
  "",
  "## Hours refresh artifact",
  "",
  "This is the committed rolling snapshot that strict `Open now` claims read.",
  "Stored source schedules above are inventory only; they do not make this",
  "artifact current.",
  "",
  "| Check | Count |",
  "| --- | ---: |",
  `| Public Google-backed places expected in the ${hoursArtifact.cycle.days}-day cycle | ${hoursArtifact.expectedGoogleBackedPlaces} |`,
  `| Snapshot rows | ${hoursArtifact.rows} |`,
  `| Rows matched to the public set | ${hoursArtifact.matchedRows} |`,
  `| Rows carrying a schedule | ${hoursArtifact.withSchedule} |`,
  `| Rows refreshed within policy, including status-only results | ${hoursArtifact.freshRefreshRows} (${hoursArtifact.cycle.refreshCoveragePct}%) |`,
  `| Rows fresh within policy | ${hoursArtifact.freshRows} (${hoursArtifact.coveragePct}%) |`,
  `| ${hoursArtifact.cycle.days}-day cycle state | ${hoursArtifact.cycle.state} |`,
  `| Cycle buckets meeting the minimum write ratio | ${hoursArtifact.cycle.completedDays} / ${hoursArtifact.cycle.days} |`,
  `| Stale rows | ${hoursArtifact.staleRows} |`,
  `| Invalid verification timestamps | ${hoursArtifact.invalidTimestamps} |`,
  `| Unmatched rows | ${hoursArtifact.unmatchedRows} |`,
  "",
  hoursArtifact.rows === 0
    ? "**Blocked:** the committed artifact contains metadata only. Do not weaken the freshness gate or invent schedules."
    : `Oldest refresh: ${hoursArtifact.oldestRefresh ?? "none"}. Newest refresh: ${hoursArtifact.newestRefresh ?? "none"}.`,
  "",
  "| Cycle day | Expected places | Refreshed within policy | Fresh schedules | Minimum met |",
  "| ---: | ---: | ---: | ---: | --- |",
  ...hoursArtifact.cycle.buckets.map(
    (bucket) =>
      `| ${bucket.cycleDay} | ${bucket.expected} | ${bucket.refreshed} | ${bucket.withSchedule} | ${bucket.complete ? "yes" : "no"} |`,
  ),
  "",
  hoursArtifact.cycle.state === "warming"
    ? `The first complete ${hoursArtifact.cycle.days}-day pass is still warming up. Missing buckets are visible, but they are not called failed until the cycle window has elapsed.`
    : hoursArtifact.cycle.state === "stalled"
      ? `**Stalled:** missing cycle days ${hoursArtifact.cycle.missingDays.join(", ") || "none"}; underfilled cycle days ${hoursArtifact.cycle.underfilledDays.join(", ") || "none"}. Check the Vercel writer before the next pull.`
      : hoursArtifact.cycle.state === "healthy"
        ? "Every cycle bucket meets the writer's minimum persistence ratio."
        : "No current refresh bucket has reached the committed artifact.",
  "",
  "Live recovery path:",
  "",
  "1. Apply `drizzle/0024_place_hours_refresh.sql` and `drizzle/0034_expose_place_hours_refresh_read_only.sql` in Supabase.",
  "2. In Vercel Production, set `HOURS_REFRESH_CRON=1`, `GOOGLE_PLACES_API_KEY`, `DATABASE_URL`, and `CRON_SECRET`.",
  "3. Confirm `/api/cron/hours-refresh` reports `enabled: true` and writes rows.",
  "4. In GitHub Actions, add browser-safe repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the 09:00 UTC data-steward job reads the snapshot through Supabase's read-only Data API after the 08:00 UTC Vercel writer.",
  "5. Review and merge the bot PR containing `places-hours-refresh.json` and the rebuilt client snapshot.",
  "",
  "## Committed event quality",
  "",
  "This table covers the curated event rows committed with the app. Runtime",
  "feed health remains a separate hosted check because live events are assembled",
  "after deployment.",
  "",
  "| Gap | Count | Why it matters |",
  "| --- | ---: | --- |",
  `| Missing category | ${eventQuality.missingCategory} | The event cannot enter a useful browse lane. |`,
  `| Placeholder category | ${eventQuality.placeholderCategory} | Generic labels hide the event's real purpose. |`,
  `| Missing venue name | ${eventQuality.missingVenueName} | A user cannot tell where to go. |`,
  `| No native venue join | ${eventQuality.unresolvedVenueJoin} | Radius cannot inherit venue details; review whether a standalone event location is intentional. |`,
  `| Area-centroid location | ${eventQuality.areaCentroid} | The event may be listed, but must not claim precise distance. |`,
  `| Unknown location | ${eventQuality.unknownLocation} | The event should not appear on a precise map. |`,
  `| Invalid time | ${eventQuality.invalidTime} | The event cannot be ordered safely. |`,
  `| Zero duration | ${eventQuality.zeroDuration} | Often signals a lost end time. |`,
  `| End before start | ${eventQuality.negativeDuration} | The schedule is internally contradictory. |`,
  "",
  `Category distribution (${eventQuality.total} rows): ${eventCategories || "none"}.`,
  "",
  "## Core amenity coverage by town",
  "",
  `The committed OpenStreetMap baseline has ${amenityCoverage.staticPoints} points.`,
  "Approved `field_amenities` rows are merged from Postgres at runtime and are",
  "not copied into this repository report, so the field count here is",
  `${amenityCoverage.fieldPoints}. Audit live field rows in the owner desk before`,
  "calling a town complete. A zero means “not mapped in the committed baseline,”",
  "not proof that the amenity does not exist.",
  "",
  `| Town | ${CORE_AMENITY_KINDS.map((kind) => amenityLabels[kind]).join(" | ")} |`,
  `| --- | ${CORE_AMENITY_KINDS.map(() => "---:").join(" | ")} |`,
  ...amenityTownRows,
  "",
  `There are ${amenityCoverage.emptyCoreCells.length} empty town/kind cells in the committed baseline.`,
  "",
  "## Brewery media trust",
  "",
  `The beer guide tracks ${breweryMedia.breweries} breweries. Legacy first-party`,
  `Google mirrors exist for ${breweryMedia.legacyMirrorPresent}, but those bytes`,
  "do not carry the exact individual source metadata required by the current",
  "publishing policy and are never rendered directly.",
  "",
  "| Check | Count |",
  "| --- | ---: |",
  `| Exact-attribution photos publishable now | ${breweryMedia.publishable} |`,
  `| Legacy candidates waiting for attribution | ${breweryMedia.waitingForAttribution} |`,
  `| Breweries without a legacy candidate | ${breweryMedia.noPhotoCandidate} |`,
  "",
  "Preferred operator path: in GitHub Actions, run **Google photo attribution",
  "backfill** with a reviewed limit. The first 16 eligible candidates are the",
  "brewery rows. This requires `GOOGLE_PLACES_API_KEY`; the workflow rebuilds",
  "the public data, runs the photo-policy tests, and opens a review PR.",
  "",
  "The equivalent local command is",
  "`npm run backfill:photo-attributions -- --limit 16 --live --confirm`.",
  "Review the paid request ceiling before running it. The beer page will pick",
  "up each exact-attribution photo after the generated data PR is merged.",
  "",
].join("\n");

writeFileSync(resolve("docs/coverage-scorecard.md"), md);

const downtownShare = Math.round(((rows[0]?.places ?? 0) / total.places) * 100);
console.log(
  `Wrote docs/coverage-scorecard.md — ${total.places} places across ${rows.length} buckets; ` +
    `${rows[0]?.muni} holds ${downtownShare}%.`,
);
