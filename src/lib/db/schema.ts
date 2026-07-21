import {
  pgTable, uuid, text, integer, real, boolean, jsonb, date,
  smallint, timestamp, index, uniqueIndex, doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CommerceLink } from "@/lib/commerce/types";

export const municipalities = pgTable(
  "municipalities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: text("type"),
    population: integer("population"),
    est: integer("est"),
    centroid_lng: doublePrecision("centroid_lng"),
    centroid_lat: doublePrecision("centroid_lat"),
    bbox_min_lng: doublePrecision("bbox_min_lng"),
    bbox_min_lat: doublePrecision("bbox_min_lat"),
    bbox_max_lng: doublePrecision("bbox_max_lng"),
    bbox_max_lat: doublePrecision("bbox_max_lat"),
    description: text("description"),
    hero_blurb: text("hero_blurb"),
    hero_image: text("hero_image"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  // slug is already uniquely indexed by .unique() above (the
  // municipalities_slug_unique constraint). An explicit
  // uniqueIndex("municipalities_slug_idx") was a duplicate btree on the same
  // column (Supabase duplicate-index advisory) — dropped via migration 0010.
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parent_slug: text("parent_slug"),
    icon: text("icon"),
    color: text("color"),
    display_order: integer("display_order").default(0),
    blurb: text("blurb"),
  },
  (t) => ({
    // slug: unique index supplied by .unique() (categories_slug_unique);
    // the duplicate categories_slug_idx was dropped via migration 0010.
    parentIdx: index("categories_parent_idx").on(t.parent_slug),
  }),
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  facet: text("facet"),
});

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category_slug: text("category_slug").notNull(),
    subcategory_slugs: jsonb("subcategory_slugs").$type<string[]>(),
    tag_slugs: jsonb("tag_slugs").$type<string[]>(),
    description: text("description"),
    short_blurb: text("short_blurb"),
    address: text("address"),
    city: text("city"),
    state: text("state").default("MD"),
    postal_code: text("postal_code"),
    municipality_slug: text("municipality_slug"),
    lng: doublePrecision("lng").notNull(),
    lat: doublePrecision("lat").notNull(),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    socials: jsonb("socials"),
    hours: jsonb("hours"),
    hours_text: text("hours_text"),
    price_band: smallint("price_band"),
    amenities: jsonb("amenities").$type<string[]>(),
    accessibility: jsonb("accessibility"),
    // Normalized commerce links (menu/order/reserve/delivery/catering). Future
    // mirror of the file-based place `commerce_links`; not written at runtime yet.
    commerce_links: jsonb("commerce_links").$type<CommerceLink[]>(),
    hero_image: text("hero_image"),
    is_verified: boolean("is_verified").default(false),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    feature_score: real("feature_score").default(5.0),
    owner_note: text("owner_note"),
    source: text("source").default("seed"),
    source_record_id: text("source_record_id"),
    source_fetched_at: timestamp("source_fetched_at", { withTimezone: true }),
    confidence: real("confidence").default(1.0),
    status: text("status").default("active"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    // slug: unique index supplied by .unique() (places_slug_unique); the
    // duplicate places_slug_idx was dropped via migration 0010.
    muniIdx: index("places_municipality_idx").on(t.municipality_slug),
    catIdx: index("places_category_idx").on(t.category_slug),
    lngLatIdx: index("places_lng_lat_idx").on(t.lng, t.lat),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").default("America/New_York"),
    is_all_day: boolean("is_all_day").default(false),
    is_recurring: boolean("is_recurring").default(false),
    recurrence_text: text("recurrence_text"),
    venue_place_slug: text("venue_place_slug"),
    venue_name: text("venue_name"),
    lng: doublePrecision("lng"),
    lat: doublePrecision("lat"),
    address: text("address"),
    municipality_slug: text("municipality_slug"),
    hero_image: text("hero_image"),
    category_slug: text("category_slug"),
    audience: jsonb("audience").$type<string[]>(),
    is_free: boolean("is_free").default(false),
    price_text: text("price_text"),
    ticket_url: text("ticket_url"),
    rsvp_url: text("rsvp_url"),
    organizer: text("organizer"),
    status: text("status").default("scheduled"),
    status_note: text("status_note"),
    source: text("source").default("seed"),
    source_record_id: text("source_record_id"),
    source_fetched_at: timestamp("source_fetched_at", { withTimezone: true }),
    confidence: real("confidence").default(1.0),
    is_verified: boolean("is_verified").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    // slug: unique index supplied by .unique() (events_slug_unique); the
    // duplicate events_slug_idx was dropped via migration 0010.
    timeIdx: index("events_starts_at_idx").on(t.starts_at),
    muniTimeIdx: index("events_muni_starts_idx").on(t.municipality_slug, t.starts_at),
  }),
);

/**
 * Rolling hours refresh (data brief 4.3). The hours-refresh cron upserts
 * one row per place per cycle; npm run refresh:hours pulls the table into
 * src/data/places-hours-refresh.json, which the place loader merges over
 * the static enrichment. refreshed_at is the verification date the
 * freshness policy reads.
 */
export const placeHoursRefresh = pgTable("place_hours_refresh", {
  slug: text("slug").primaryKey(),
  placeId: text("place_id").notNull(),
  weekdayHours: jsonb("weekday_hours").$type<string[] | null>(),
  businessStatus: text("business_status"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull(),
});

export const dataSources = pgTable("data_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name"),
  type: text("type"),
  url: text("url"),
  enabled: boolean("enabled").default(true),
  last_run_at: timestamp("last_run_at", { withTimezone: true }),
  last_status: text("last_status"),
  config: jsonb("config"),
});

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_slug: text("source_slug").notNull(),
    started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    status: text("status"),
    records_in: integer("records_in").default(0),
    records_upserted: integer("records_upserted").default(0),
    records_failed: integer("records_failed").default(0),
    error: text("error"),
  },
  (t) => ({
    sourceTimeIdx: index("ingest_runs_source_time_idx").on(t.source_slug, t.started_at),
  }),
);

export const civicAlerts = pgTable("civic_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body"),
  severity: text("severity"),
  source: text("source"),
  starts_at: timestamp("starts_at", { withTimezone: true }).defaultNow(),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  link: text("link"),
  is_active: boolean("is_active").default(true),
});

export const radii = pgTable("radii", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id"),
  device_id: text("device_id"),
  short_code: text("short_code").notNull().unique(),
  name: text("name"),
  center_lng: doublePrecision("center_lng").notNull(),
  center_lat: doublePrecision("center_lat").notNull(),
  mode: text("mode"),
  minutes: integer("minutes"),
  meters: integer("meters"),
  filters: jsonb("filters"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/**
 * Per-fetch distribution snapshot for each live event feed. Written
 * once per successful pull from `feed-snapshot.ts`; the data-health
 * dashboard reads the latest two rows per source to compute anomaly
 * flags that survive deploys + cold starts.
 *
 * No FK to a `feeds` table — `source` is the string key already used
 * in code (`"dfp"`, `"county"`, etc.). The composite index on
 * (source, taken_at desc) is the only query pattern.
 */
export const feed_snapshots = pgTable(
  "feed_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    taken_at: timestamp("taken_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    free_ratio: real("free_ratio").notNull(),
    empty_desc_ratio: real("empty_desc_ratio").notNull(),
    /** {name, share} or null. */
    top_venue: jsonb("top_venue").$type<{ name: string; share: number } | null>(),
    /** {name, share} or null. */
    top_category: jsonb("top_category").$type<{ name: string; share: number } | null>(),
    earliest: timestamp("earliest", { withTimezone: true }),
    latest: timestamp("latest", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    sourceTakenIdx: index("feed_snapshots_source_taken_idx").on(
      t.source,
      t.taken_at,
    ),
  }),
);

/**
 * Web Push subscriptions — one row per (device, endpoint) pair. The
 * `endpoint` is the URL the browser's push service gave us; it is the
 * stable identity. `keys.p256dh` + `keys.auth` are the encryption
 * material the web-push library needs to actually deliver a payload.
 * `topics` is the user's per-topic subscription state.
 *
 * No FK to a users table by design: the app currently has no auth, so
 * a subscription belongs to a device. When auth lands, add user_id and
 * backfill from device_id.
 */
export const push_subscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    user_agent: text("user_agent"),
    device_id: text("device_id"),
    topics: jsonb("topics").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    // Per-device notification preferences + town targeting (0020). All
    // nullable: null home_town = untargeted; null quiet_* = no quiet hours.
    home_town: text("home_town"),
    // Eastern-time quiet window, inclusive start .. exclusive end hour (0-23).
    // Non-urgent pushes are held during the window; civic alerts bypass.
    quiet_start: smallint("quiet_start"),
    quiet_end: smallint("quiet_end"),
  },
  (t) => ({
    endpointIdx: uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    deviceIdx: index("push_subscriptions_device_idx").on(t.device_id),
    homeTownIdx: index("push_subscriptions_home_town_idx").on(t.home_town),
  }),
);

/**
 * saved_events (critic-1) — device-scoped record of which push-enabled devices
 * saved which event, so the "one hour before something you saved" reminder can
 * reach exactly those devices. Keyed by the device's push-subscription
 * `endpoint` (the same device key push_subscriptions uses; NO user_id — saves
 * are device-local). Populated by /api/saved when an event is saved on a device
 * that has push consent. RLS deny-all like every other table; only the
 * BYPASSRLS server role touches it.
 */
/**
 * beta_emails — the beta-access email list. One field on /beta, used to mint,
 * send, and manage a personal access code. RLS deny-all like every table
 * (server role only). Deleting the row and its labeled beta code fulfills a
 * removal request.
 */
export const beta_emails = pgTable(
  "beta_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    source: text("source").notNull().default("beta_page"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex("beta_emails_email_uq").on(t.email),
  }),
);

/**
 * beta_codes — per-tester access codes. Replaces the single shared password as
 * the way people come in, so each beta user's access can be managed internally
 * and individually revoked (flip `revoked` and only that person is locked out).
 * The shared BETA_PASSWORD stays as an owner master key alongside these, so we
 * can never lock ourselves out. Third-party analytics receives only an
 * aggregate beta-active event, never this code or its label.
 *
 * `code` is a readable slug (e.g. "frederick-ada7") the owner texts to a tester;
 * `label` is who it's for ("Jane from the co-op"). `redeemed_at` is first unlock,
 * `uses` counts redemptions (a person may unlock on phone + laptop),
 * `last_seen_at` is refreshed by a once-per-session ping so the admin list shows
 * who is actually active. RLS deny-all like every table — the BYPASSRLS server
 * role owns all reads/writes; the edge middleware never touches the DB (it
 * verifies a signed cookie), so the hot path stays fast.
 */
/**
 * usage_counters — daily call counters for the paid upstreams (Google photos,
 * Ask LLM, Mapbox). One row per (Eastern day, upstream); incremented fail-soft
 * beside each paid fetch (lib/usage-meter.ts) and read by /admin/costs. RLS
 * deny-all like every table; server role only.
 */
export const usage_counters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: date("day").notNull(),
    upstream: text("upstream").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    dayUpstreamUq: uniqueIndex("usage_counters_day_upstream_uq").on(t.day, t.upstream),
  }),
);

export const beta_codes = pgTable(
  "beta_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    label: text("label"),
    revoked: boolean("revoked").notNull().default(false),
    uses: integer("uses").notNull().default(0),
    redeemed_at: timestamp("redeemed_at", { withTimezone: true }),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    codeUq: uniqueIndex("beta_codes_code_uq").on(t.code),
  }),
);

/**
 * NFC invite cards + per-member first-party analytics (migration 0030).
 *
 * Physical cards carry https://frederickradius.app/j/<code>. A tap validates the
 * card, assigns the DEVICE an anonymous member (a random url-safe id in a signed
 * httpOnly `fr_member` cookie), unlocks it past the beta wall the SAME signed way
 * a redeemed per-user code does, and drops it at /today. In-app activity is then
 * written to nfc_events so the owner can see, per card, who joined and what they
 * do. The member cookie is HMAC-signed (so a member can only ever log against
 * its own id) and grants NO access on its own — the fr_beta cookie is the access
 * credential. Anonymous by default: name/email stay null unless volunteered, and
 * opted_out stops all logging. Free-text (search/Ask query) is stripped before
 * insert, so the behavioral log holds only page paths and categorical props. RLS
 * deny-all like every table; the BYPASSRLS server role owns all reads/writes, so
 * the anon key can never read a member's volunteered contact details or the log.
 */
export const nfc_cards = pgTable(
  "nfc_cards",
  {
    code: text("code").primaryKey(),
    label: text("label"),
    batch: text("batch"),
    active: boolean("active").notNull().default(true),
    // Reserved for a future per-card cap; not enforced unless set.
    max_members: integer("max_members"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    batchIdx: index("nfc_cards_batch_idx").on(t.batch),
  }),
);

export const nfc_members = pgTable(
  "nfc_members",
  {
    id: text("id").primaryKey(),
    card_code: text("card_code").references(() => nfc_cards.code),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
    name: text("name"),
    email: text("email"),
    opted_out: boolean("opted_out").notNull().default(false),
  },
  (t) => ({
    cardIdx: index("nfc_members_card_idx").on(t.card_code),
    createdIdx: index("nfc_members_created_idx").on(t.created_at),
  }),
);

export const nfc_events = pgTable(
  "nfc_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    member_id: text("member_id").references(() => nfc_members.id),
    event: text("event").notNull(),
    path: text("path"),
    props: jsonb("props"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberCreatedIdx: index("nfc_events_member_created_idx").on(t.member_id, t.created_at),
    createdIdx: index("nfc_events_created_idx").on(t.created_at),
  }),
);

export const saved_events = pgTable(
  "saved_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpoint: text("endpoint").notNull(),
    event_slug: text("event_slug").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    endpointSlugUq: uniqueIndex("saved_events_endpoint_slug_uq").on(t.endpoint, t.event_slug),
    slugIdx: index("saved_events_slug_idx").on(t.event_slug),
  }),
);

/**
 * commerce_link_reports — lightweight queue for "this order/menu/reserve link
 * is broken." Unauthenticated + fail-soft like the other public write paths;
 * RLS deny-all (all access is via the BYPASSRLS server role). Deliberately NOT
 * folded into community_reports, which is a MAP layer — a broken link is place
 * metadata, not a map pin, and must never surface as one. An admin queue can
 * read this later; Phase 1 just captures it.
 */
export const commerce_link_reports = pgTable(
  "commerce_link_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    place_slug: text("place_slug").notNull(),
    place_name: text("place_name"),
    /** The offending link's id when known, else its raw URL. */
    link_ref: text("link_ref"),
    url: text("url"),
    provider: text("provider"),
    link_type: text("link_type"),
    issue_type: text("issue_type").notNull().default("broken_link"),
    note: text("note"),
    status: text("status").notNull().default("open"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => ({
    placeIdx: index("commerce_link_reports_place_idx").on(t.place_slug),
    statusIdx: index("commerce_link_reports_status_idx").on(t.status),
  }),
);

/**
 * Push-fanout dedupe log. Each `(topic, dedupe_key)` is sent at most
 * once: a cron does INSERT … ON CONFLICT DO NOTHING and only fans out
 * to subscribers when the insert reports it created the row. This is
 * the simplest way to make a broadcast "send once" without per-user
 * state. Old rows are pruned after 30 days by the data-health cron.
 */
export const push_log = pgTable(
  "push_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    dedupe_key: text("dedupe_key").notNull(),
    title: text("title"),
    body: text("body"),
    url: text("url"),
    sent_at: timestamp("sent_at", { withTimezone: true }).defaultNow(),
    sent_count: integer("sent_count").notNull().default(0),
    // Notification clicks reported by the service worker (aggregate per send).
    open_count: integer("open_count").notNull().default(0),
  },
  (t) => ({
    topicKeyIdx: uniqueIndex("push_log_topic_key_idx").on(t.topic, t.dedupe_key),
    sentAtIdx: index("push_log_sent_at_idx").on(t.sent_at),
  }),
);

/**
 * Archive of PUBLIC scanner incidents, one row per distinct call, banked by
 * the scanner-archive cron so the ephemeral live feed becomes a history the
 * trend surfaces can read. Only the same public, non-medical calls the live
 * layer shows are ever written (the allowlist runs before insert), and the
 * columns are already de-identified (kind + block-level location) — no units,
 * radio codes, or personal detail. `dedupe_key` (kind|location|occurred_at)
 * keeps the same call from banking twice across cron cycles. RLS deny-all,
 * server-role only, matching the rest of the schema.
 */
export const scanner_incidents = pgTable(
  "scanner_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupe_key: text("dedupe_key").notNull(),
    kind: text("kind").notNull(),
    location: text("location").notNull(),
    road_impact: boolean("road_impact").notNull().default(false),
    // When the call was dispatched (from the feed message timestamp).
    occurred_at: timestamp("occurred_at", { withTimezone: true }).notNull(),
    inserted_at: timestamp("inserted_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    dedupeIdx: uniqueIndex("scanner_incidents_dedupe_idx").on(t.dedupe_key),
    occurredIdx: index("scanner_incidents_occurred_idx").on(t.occurred_at),
    kindIdx: index("scanner_incidents_kind_idx").on(t.kind),
  }),
);

/**
 * Search & Ask MISSES — the app's own record of what it was asked for and
 * couldn't answer. One row each time a search returns nothing or an Ask
 * answer lands with no real place to point at. `query_key` is the normalized
 * form (lowercased, punctuation-stripped) so repeats group; `query` keeps a
 * readable sample. This is the data-gaps flywheel: the honest, evidence-based
 * answer to "what data is missing." Server-role only, RLS deny-all. Stores
 * only the query text, its kind, and when — no visitor identifier.
 */
export const search_misses = pgTable(
  "search_misses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Raw query as typed (trimmed, capped) — a readable sample for the board. */
    query: text("query").notNull(),
    /** Normalized grouping key (lowercased, punctuation-stripped, collapsed). */
    query_key: text("query_key").notNull(),
    /** 'search' (zero results) | 'ask' (answer with no grounded sources). */
    kind: text("kind").notNull(),
    occurred_at: timestamp("occurred_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    keyIdx: index("search_misses_key_idx").on(t.query_key),
    occurredIdx: index("search_misses_occurred_idx").on(t.occurred_at),
  }),
);

/**
 * User-submitted content awaiting review: place suggestions, event
 * suggestions, and business-owner claims. One row per submission;
 * `kind` selects the shape stored in `payload`, `status` drives the
 * /admin moderation queue. `manage_token` is issued when a
 * business_claim is approved: the no-account capability credential for
 * the owner's management surface. No FK to a users table by design
 * (the app has no auth) or to places (places are file-sourced);
 * `place_slug` is the loose string key.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    payload: jsonb("payload").notNull(),
    place_slug: text("place_slug"),
    submitter_name: text("submitter_name"),
    submitter_email: text("submitter_email"),
    manage_token: text("manage_token"),
    review_note: text("review_note"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("submissions_status_idx").on(t.status),
    kindStatusIdx: index("submissions_kind_status_idx").on(t.kind, t.status),
    manageTokenIdx: uniqueIndex("submissions_manage_token_idx").on(t.manage_token),
  }),
);

// ════════════════════════════════════════════════════════════════════
//                    Phase 1 — User profiles + follows
// ════════════════════════════════════════════════════════════════════
//
// Auth is owned by Supabase (auth.users). The app extends that with:
//   - user_profiles   1:1 with auth.users(id); app-specific preferences
//   - follows         m:n between users and places (by slug)
//   - place_claims    one-per-place business-owner claim lifecycle
//   - business_updates posts a claimed business can publish to its
//                      followers (Phase 3 — schema lands now, UI later)
//
// Why slug-based FKs to `places`? The runtime source of truth for the
// place catalog is still the merged JSON in `src/data/places.ts`
// (places-dfp.json + places-discovered.json + curated seeds). The
// existing `places` table in this file is a future-prep mirror that
// isn't populated at write time. Following the `submissions` table's
// existing pattern, the new tables key off `place_slug TEXT` instead
// of a UUID FK to `places.id`. When the static→DB migration happens,
// these can be promoted to proper FKs in one alter-table.
//
// Why no FK to auth.users? `auth.users` lives in Supabase's `auth`
// schema, which Drizzle doesn't reflect natively. The app validates
// `user_id` via the session before every write; uniqueness +
// authorization both live at the API-route layer, not the DB.
//
// RLS: NOT enabled in this migration. All writes flow through
// /api/* routes which check auth + ownership before touching the
// table. A follow-up migration will add RLS policies as belt-and-
// suspenders once those routes are wired and tested.

/**
 * Per-user app-side profile. One row per Supabase auth user. Created
 * on demand at first sign-in by the /api/auth/callback handler.
 */
export const user_profiles = pgTable(
  "user_profiles",
  {
    // = auth.users.id from Supabase. Not an FK at the DB level for the
    // reason above; the API layer asserts the session before write.
    id: uuid("id").primaryKey(),
    display_name: text("display_name"),
    home_muni_slug: text("home_muni_slug"),
    notification_prefs: jsonb("notification_prefs").$type<{
      // Pending Phase 3 surfaces. Empty by default; populated through
      // /settings as preferences accumulate. Keeping this as JSONB keeps
      // the migration footprint small — new prefs are app-side only.
      digest?: "off" | "weekly" | "daily";
      new_followed_update?: boolean;
      open_now_nudges?: boolean;
    }>(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
);

/**
 * A user's follow relationship to a place. Replaces the localStorage
 * `fr:saved:v1` bookmark when the user is authenticated; the
 * /api/follows endpoints sync localStorage in on first sign-in so
 * existing /my-radius lists don't get lost.
 *
 * One-tap data model:
 *   - (user_id, place_slug) is unique — duplicates not allowed
 *   - Deletes by composite key, not by id, so the API can be slug-only
 *   - `source` records where the follow originated, useful for product
 *     analytics ("Saved before sign-in" vs "Followed after viewing
 *     map detail")
 */
export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    place_slug: text("place_slug").notNull(),
    source: text("source"), // "synced" | "place_detail" | "map" | "search" | etc.
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userPlaceUq: uniqueIndex("follows_user_place_uq").on(t.user_id, t.place_slug),
    userIdx: index("follows_user_idx").on(t.user_id),
    placeIdx: index("follows_place_idx").on(t.place_slug),
  }),
);

/**
 * Business-owner claim of a specific place. Owners verify they
 * represent the place via the existing /business/claim form; the
 * submission lands as a `submissions` row with kind="claim", and
 * once approved, a `place_claims` row is created here linking the
 * claimer's auth.users.id to the place_slug.
 *
 * Why a separate table from `submissions`? `submissions` is the
 * INTAKE queue (one row per request, may be rejected). `place_claims`
 * is the LEDGER (one row per active claim, exists only when verified).
 * This keeps the read path for "is this place claimed?" a clean
 * SELECT on one indexed column instead of joining on status filters.
 */
export const place_claims = pgTable(
  "place_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    place_slug: text("place_slug").notNull(),
    claimed_by_user_id: uuid("claimed_by_user_id").notNull(),
    claimed_at: timestamp("claimed_at", { withTimezone: true }).defaultNow(),
    // The originating submissions.id, for an audit trail back to the
    // verification evidence the owner provided.
    submission_id: uuid("submission_id"),
    // "active" | "revoked" — set to "revoked" if a claim is later
    // contested or the owner relinquishes; never DELETE so we keep
    // the history.
    status: text("status").notNull().default("active"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    // One ACTIVE claim per slug; revoked ones can coexist.
    placeActiveUq: uniqueIndex("place_claims_active_uq")
      .on(t.place_slug)
      .where(sql`${t.status} = 'active'`),
    userIdx: index("place_claims_user_idx").on(t.claimed_by_user_id),
  }),
);

/**
 * Updates a claimed business publishes to its followers. Phase 3 —
 * the schema lands now so it's stable, the UI is intentionally NOT
 * built in this migration (per the brief: "do not build a full SaaS
 * dashboard yet unless the current app structure already supports it
 * cleanly").
 *
 * The PlaceDetail page and /my-radius will render published updates
 * in a "Recent updates from places you follow" rail once admin-only
 * authoring is added in a follow-up.
 */
export const business_updates = pgTable(
  "business_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    place_slug: text("place_slug").notNull(),
    // The author. References auth.users.id (not FK-enforced at the
    // DB level for the reason above). At Phase 3 publish-time the API
    // verifies this matches an ACTIVE place_claims row for the slug.
    created_by_user_id: uuid("created_by_user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // "announcement" | "event" | "special" | "closure" | "hours" | "general"
    // Kept as a text column rather than an enum so adding a new kind
    // doesn't require a migration — small product flexibility win.
    update_type: text("update_type").notNull().default("general"),
    // "draft" | "published" | "archived"
    status: text("status").notNull().default("draft"),
    published_at: timestamp("published_at", { withTimezone: true }),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    placePublishedIdx: index("business_updates_place_published_idx").on(
      t.place_slug,
      t.published_at,
    ),
    statusIdx: index("business_updates_status_idx").on(t.status),
  }),
);

/**
 * Field-collected civic amenities — the /collect walkabout tool. A
 * collector walks downtown with a phone, drops a pin on a trash can /
 * water fountain / bench / EV charger / outlet / dog station, picks the
 * type from a fixed list, and it lands here. The /map amenity layer
 * merges these in (getFieldAmenities → Amenity shape → same kind→slug→
 * icon path as the static OSM amenities), so a collected point appears
 * on the live map immediately under its matching toggle.
 *
 * No FK to a users table (the app's collect tool is passcode-gated, not
 * account-bound); `collected_by` is a free-text label the collector can
 * set. `status` defaults to 'approved' (instant-publish) but exists so a
 * future moderation pass can hide a point without deleting it. Writes go
 * through /api/collect using the server postgres role; RLS is enabled
 * with no policies so the anon key can't touch the table directly.
 */
export const field_amenities = pgTable(
  "field_amenities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    name: text("name"),
    detail: text("detail"),
    note: text("note"),
    lng: doublePrecision("lng").notNull(),
    lat: doublePrecision("lat").notNull(),
    municipality: text("municipality"),
    photo_url: text("photo_url"),
    status: text("status").notNull().default("approved"),
    source: text("source").notNull().default("field"),
    collected_by: text("collected_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    statusIdx: index("field_amenities_status_idx").on(t.status),
    lngLatIdx: index("field_amenities_lng_lat_idx").on(t.lng, t.lat),
  }),
);

/**
 * Community reports — the crowdsourced "community layer" (Phase 1). Distinct
 * from field_amenities (permanent infrastructure): these are EPHEMERAL,
 * observational reports — hazards (pothole, bad sidewalk, flooding), live
 * conditions (parking full, trail muddy), tips, and local notes.
 *
 * Moderation model (Phase 1): a trusted submitter (valid COLLECT_PASSCODE)
 * publishes immediately (status='approved'); everyone else's report lands
 * 'pending' for /admin review. `expires_at` makes reports ephemeral so the map
 * stays current and stale spam ages out on its own. `confirmations` backs the
 * future Waze-style "still there?" voting.
 *
 * Writes flow through /api/reports using the server postgres role; RLS is
 * enabled with NO policies so the anon key can't read/write it directly.
 */
export const community_reports = pgTable(
  "community_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull(), // hazard | condition | tip | note
    subtype: text("subtype"), // pothole, parking_full, etc. (optional)
    title: text("title"),
    note: text("note"),
    photo_url: text("photo_url"),
    lng: doublePrecision("lng").notNull(),
    lat: doublePrecision("lat").notNull(),
    municipality: text("municipality"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    source: text("source").notNull().default("community"),
    reported_by: text("reported_by"),
    confirmations: integer("confirmations").notNull().default(0),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("community_reports_status_idx").on(t.status),
    lngLatIdx: index("community_reports_lng_lat_idx").on(t.lng, t.lat),
    expiresIdx: index("community_reports_expires_idx").on(t.expires_at),
    createdIdx: index("community_reports_created_idx").on(t.created_at),
  }),
);

/**
 * Food-truck operator claims — the owner-approved gate on the beacon layer.
 *
 * A roaming truck's operator asks to claim their truck (by FoodTruck.slug);
 * the request lands here as status='pending'. The owner approves it in
 * /admin/food-trucks, which mints a random opaque `token` and stores it. That
 * token is the capability credential: it is the ONLY thing that lets an
 * operator drop a live beacon, and it is validated against an APPROVED row for
 * that exact truck_slug on every write. Same no-account, no-FK posture as
 * `submissions.manage_token`; RLS deny-all (server BYPASSRLS role only).
 *
 * `contact` is free text (email or phone) so the owner can reach the operator
 * out of band before approving. `decided_at` stamps the approve/reject moment.
 */
export const food_truck_claims = pgTable(
  "food_truck_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    truck_slug: text("truck_slug").notNull(),
    operator_name: text("operator_name").notNull(),
    contact: text("contact").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    // Null until approved; a random opaque capability token when approved.
    token: text("token"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    decided_at: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("food_truck_claims_status_idx").on(t.status),
    truckIdx: index("food_truck_claims_truck_idx").on(t.truck_slug),
    // The token is looked up on every beacon write; unique so one token maps
    // to exactly one claim. Partial so many pending rows (null token) coexist.
    tokenUq: uniqueIndex("food_truck_claims_token_uq")
      .on(t.token)
      .where(sql`${t.token} is not null`),
  }),
);

/**
 * Food-truck live beacons — an approved operator's "I'm out here now" drop.
 *
 * Each row is a location + a self-expiring window. The honest-expiry invariant
 * lives in the pure read layer (src/lib/food-trucks/beacon.ts): a beacon is
 * only ever shown while `now` sits inside [started_at, expires_at). The write
 * path (/api/food-trucks/beacon) CAPS expires_at server-side (max 8 hours out)
 * so a stale beacon can never linger, county-locks the coordinates, and
 * requires a valid token matching an approved claim for `truck_slug`.
 *
 * No FK to a trucks table — the roster is the static file src/data/food-trucks.ts
 * and `truck_slug` is the loose string key (same posture as every other table
 * here). RLS deny-all; every read/write goes through the BYPASSRLS server role.
 */
export const food_truck_beacons = pgTable(
  "food_truck_beacons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    truck_slug: text("truck_slug").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    spot: text("spot"),
    note: text("note"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    truckIdx: index("food_truck_beacons_truck_idx").on(t.truck_slug),
    // The display loader reads "live now" = expires_at > now(); index it.
    expiresIdx: index("food_truck_beacons_expires_idx").on(t.expires_at),
  }),
);

/**
 * Dear Frederick submissions — the public letter-submission intake.
 *
 * Dear Frederick is a community project of handwritten letters mailed to a PO
 * box and published as CURATED static data (src/data/dear-frederick.ts). This
 * table only captures DIGITAL submissions: a member of the public uploads a
 * scan of a letter through /dear-frederick/submit, and it lands here pending
 * for the owner to review in /admin/dear-frederick. Approving a row just marks
 * it approved; the owner then transcribes it into the static file by hand, so
 * publishing stays curated and the published letters are never DB-dynamic.
 *
 * `image_url` is the scan in Vercel Blob. `signature`, `contact`, and `note`
 * are all optional (a signature defaults to "Anonymous" for display; `contact`
 * is a private email/phone for owner follow-up and MUST NOT be public). No FK
 * to a letters table — published letters are file-sourced and a submission may
 * never be published. RLS deny-all; every read/write goes through the BYPASSRLS
 * server role, so the anon key can never read a sender's contact details.
 */
export const dear_frederick_submissions = pgTable(
  "dear_frederick_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    image_url: text("image_url").notNull(),
    signature: text("signature"),
    contact: text("contact"),
    note: text("note"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    decided_at: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("dear_frederick_submissions_status_idx").on(t.status),
    createdIdx: index("dear_frederick_submissions_created_idx").on(t.created_at),
  }),
);

// Run once after migration:
export const POSTGIS_NOTE = sql`-- pg_trgm + FTS indexes (run as raw SQL after migration):
-- pg_trgm lives in the extensions schema (NOT public — Supabase advisory),
-- so qualify the opclass: extensions.gin_trgm_ops.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
-- CREATE INDEX places_name_trgm_idx ON places USING GIN (name extensions.gin_trgm_ops);
-- CREATE INDEX places_fts_idx ON places USING GIN (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
-- CREATE INDEX events_fts_idx ON events USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));`;
