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
import { PLACES as SOURCE_PLACES } from "@/data/places";
import { isHoursFresh } from "@/lib/hours-freshness";

type Place = {
  slug: string;
  municipality?: string;
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
].join("\n");

writeFileSync(resolve("docs/coverage-scorecard.md"), md);

const downtownShare = Math.round(((rows[0]?.places ?? 0) / total.places) * 100);
console.log(
  `Wrote docs/coverage-scorecard.md — ${total.places} places across ${rows.length} buckets; ` +
    `${rows[0]?.muni} holds ${downtownShare}%.`,
);
