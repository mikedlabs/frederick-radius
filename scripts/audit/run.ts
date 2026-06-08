/**
 * Unified data audit — `npm run audit`.
 *
 * One honest command that tells us what the app can safely present. It does
 * NOT replace the existing focused scripts; it ORCHESTRATES the read-only
 * ones (audit-data, coord-audit, closures-report) and ADDS the gaps the
 * brief names — place + event readiness (via the shared recommendationTier /
 * eventTier gates), stale buckets, and a user-facing opportunity report.
 *
 * Writes both readable markdown and machine-readable JSON to audit-reports/.
 * Reuses the real loaders so every count reconciles with what the app loads.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { EVENTS as RAW_EVENTS, type Event } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";
import { recommendationTier, type RecommendationTier } from "@/lib/quality/readiness";
import { eventTier } from "@/lib/quality/event-readiness";
import { isCivicEvent, allUpcoming, civicUpcoming, type EventWithMeta } from "@/lib/loaders/events";
import { allAmenities } from "@/lib/loaders/amenities";
import { isUpcomingEvent } from "@/lib/events/visible";
import { haversineMeters } from "@/lib/geo";

const OUT = join(process.cwd(), "audit-reports");
const NOW = new Date();
const TIER_LABEL: Record<RecommendationTier, string> = {
  1: "Recommend", 2: "Browse only", 3: "Needs review", 4: "Hide/archive",
};

function write(name: string, md: string, json: unknown) {
  writeFileSync(join(OUT, `${name}.md`), md);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
}
function pct(n: number, total: number) { return total ? ((n / total) * 100).toFixed(1) + "%" : "0%"; }
function tierBlock<T>(items: { item: T; tier: RecommendationTier; reason: string; label: string }[]) {
  const counts: Record<RecommendationTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const reasons: Record<RecommendationTier, Map<string, number>> = { 1: new Map(), 2: new Map(), 3: new Map(), 4: new Map() };
  const examples: Record<RecommendationTier, string[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const { tier, reason, label } of items) {
    counts[tier]++;
    const key = reason.replace(/\(.*\)/, "").trim();
    reasons[tier].set(key, (reasons[tier].get(key) ?? 0) + 1);
    if (examples[tier].length < 8) examples[tier].push(label);
  }
  return { counts, reasons, examples };
}

// ── 1 + 2. Readiness (places + events) ──────────────────────────────────
function placeReadiness(places: PlaceCardData[]) {
  const scored = places.map((p) => ({ item: p, label: `${p.name} [${p.category}/${p.source}]`, ...recommendationTier(p) }));
  const { counts, reasons, examples } = tierBlock(scored);
  const total = places.length;
  let md = `# Place readiness\n\n${total} public places. Tiers via \`recommendationTier()\`.\n\n`;
  for (const t of [1, 2, 3, 4] as RecommendationTier[]) {
    md += `## Tier ${t} — ${TIER_LABEL[t]}: ${counts[t]} (${pct(counts[t], total)})\n`;
    for (const [r, n] of [...reasons[t]].sort((a, b) => b[1] - a[1])) md += `- ${r}: ${n}\n`;
    md += `\n_e.g._ ${examples[t].join(" · ")}\n\n`;
  }
  write("places-readiness", md, { total, counts, byReason: Object.fromEntries([1, 2, 3, 4].map((t) => [t, Object.fromEntries(reasons[t as RecommendationTier])])) });
  return { total, counts };
}
function eventReadiness(events: readonly Event[]) {
  const scored = events.map((e) => ({ item: e, label: `${e.title} [${e.category}/${e.source}]`, ...eventTier(e, NOW) }));
  const { counts, reasons, examples } = tierBlock(scored);
  const total = events.length;
  const civic = events.filter(isCivicEvent).length;
  let md = `# Event readiness\n\n${total} seed/curated events (civic ${civic} · social ${total - civic}). Tiers via \`eventTier()\`.\n\n`;
  for (const t of [1, 2, 3, 4] as RecommendationTier[]) {
    md += `## Tier ${t} — ${TIER_LABEL[t]}: ${counts[t]} (${pct(counts[t], total)})\n`;
    for (const [r, n] of [...reasons[t]].sort((a, b) => b[1] - a[1])) md += `- ${r}: ${n}\n`;
    md += `\n_e.g._ ${examples[t].join(" · ")}\n\n`;
  }
  write("events-readiness", md, { total, civic, social: total - civic, counts, byReason: Object.fromEntries([1, 2, 3, 4].map((t) => [t, Object.fromEntries(reasons[t as RecommendationTier])])) });
  return { total, counts, civic };
}

// ── 3. Stale buckets ────────────────────────────────────────────────────
function staleReport(places: PlaceCardData[], events: readonly Event[]) {
  const dayMs = 86_400_000;
  const age = (iso?: string) => (iso ? (NOW.getTime() - Date.parse(iso)) / dayMs : NaN);
  const placesNoFresh = places.filter((p) => !p.last_verified_at).length;
  const placeAges = places.map((p) => age(p.last_verified_at)).filter((d) => Number.isFinite(d));
  const p30 = placeAges.filter((d) => d > 30).length;
  const p90 = placeAges.filter((d) => d > 90).length;
  const tempClosed = places.filter((p) => p.is_operational === "closed_temporarily").length;
  const needsVerify = places.filter((p) => p.is_operational === "needs_verification").length;

  const pastEvents = events.filter((e) => !e.is_recurring && Number.isFinite(Date.parse(e.starts_at)) && !isUpcomingEvent(e, NOW));
  const undated = events.filter((e) => !Number.isFinite(Date.parse(e.starts_at)));
  const noVerify = events.filter((e) => !e.last_verified_at).length;
  const noSource = events.filter((e) => !e.source_url && e.source !== "seed" && e.source !== "manual");

  const data = {
    places: { total: places.length, missing_last_verified: placesNoFresh, older_than_30d: p30, older_than_90d: p90, temporarily_closed: tempClosed, needs_verification: needsVerify },
    events: { total: events.length, past_still_present: pastEvents.length, undated, missing_last_verified: noVerify, missing_source_url_noncurated: noSource.length },
  };
  let md = `# Stale data\n\n## Places (${places.length})\n`;
  md += `- missing last_verified_at: ${placesNoFresh}\n- older than 30d: ${p30}\n- older than 90d: ${p90}\n- temporarily closed: ${tempClosed}\n- needs verification: ${needsVerify}\n\n`;
  md += `## Events (${events.length})\n`;
  md += `- **past still present: ${pastEvents.length}**${pastEvents.length ? ` — e.g. ${pastEvents.slice(0, 6).map((e) => e.title).join(" · ")}` : ""}\n`;
  md += `- undated: ${undated.length}\n- missing last_verified_at: ${noVerify}\n- non-curated w/ no source URL: ${noSource.length}\n\n`;
  md += `_Note: per-row freshness defaults to the season's editorial sweep date; "older than" reflects that sweep, not staleness of every field._\n`;
  write("stale", md, data);
  return data;
}

// ── 4. Opportunity report (UX the data already supports) ────────────────
function opportunityReport(places: PlaceCardData[], events: readonly Event[]) {
  const near = (a: { lng: number; lat: number }, b: { lng: number; lat: number }, m: number) => haversineMeters(a, b) <= m;
  const byCat = (c: string) => places.filter((p) => p.category === c);
  const parks = [...byCat("park"), ...byCat("trail"), ...byCat("playground")];
  const parking = byCat("parking");
  const upcoming = events.filter((e) => (e.is_recurring || isUpcomingEvent(e, NOW)) && e.geom);

  const eventsWithParking = upcoming.filter((e) => e.geom && parking.some((p) => p.geom && near(e.geom!, p.geom, 500))).length;
  const restrooms = allAmenities().filter((a) => a.kind === "restroom");
  const parksWithRestroom = parks.filter((pk) => pk.geom && restrooms.some((r) => near(pk.geom!, r, 300))).length;
  const RAINY = new Set(["museum", "library", "gallery", "theater", "shopping", "antiques", "book-store", "market"]);
  const rainyDay = places.filter((p) => RAINY.has(p.category)).length;
  const kidFriendly = places.filter((p) => ["family", "playground"].includes(p.category)).length;
  const liveMusic = upcoming.filter((e) => e.category === "music").length;
  const civicVsSocial = { civic: events.filter(isCivicEvent).length, social: events.filter((e) => !isCivicEvent(e)).length };
  const verifiedHours = places.filter((p) => p.open_confidence === "verified").length;

  // Per-town highlight gaps + underfill.
  const towns = MUNICIPALITIES.map((m) => {
    const tp = places.filter((p) => p.municipality === m.slug);
    const tier1 = tp.filter((p) => recommendationTier(p).tier === 1).length;
    const ev = upcoming.filter((e) => e.municipality === m.slug).length;
    return { slug: m.slug, name: m.name, places: tp.length, tier1, events: ev };
  }).sort((a, b) => a.tier1 - b.tier1);
  const highlightGaps = towns.filter((t) => t.tier1 < 5);
  const underfilled = towns.filter((t) => t.places < 20 || t.events === 0);

  const data = {
    parking_near_events: { events_with_parking_within_500m: eventsWithParking, total_upcoming_with_geo: upcoming.length },
    restrooms_near_parks: { parks_with_restroom_within_300m: parksWithRestroom, total_parks: parks.length },
    rainy_day_options: rainyDay,
    kid_friendly_places: kidFriendly,
    live_music_upcoming: liveMusic,
    open_now_potential: { verified_hours_places: verifiedHours, coverage: pct(verifiedHours, places.length) },
    civic_vs_social: civicVsSocial,
    town_highlight_gaps: highlightGaps,
    underfilled_towns: underfilled,
  };
  let md = `# UX opportunities the data supports\n\n`;
  md += `- **Parking near events:** ${eventsWithParking}/${upcoming.length} upcoming events have a parking place within 500m → "park here" affordance.\n`;
  md += `- **Restrooms near parks:** ${parksWithRestroom}/${parks.length} parks/trails have a known restroom within 300m → a "restroom nearby" signal.\n`;
  md += `- **Rainy-day options:** ${rainyDay} indoor places (museum/library/gallery/theater/shops) → a "good in rain" collection.\n`;
  md += `- **Kid-friendly:** ${kidFriendly} family/playground places → a "with kids" lane.\n`;
  md += `- **Live music:** ${liveMusic} upcoming music events → a live-music grouping.\n`;
  md += `- **Open-now grouping:** ${verifiedHours} places (${pct(verifiedHours, places.length)}) have verified hours → trustworthy "open now".\n`;
  md += `- **Civic vs social:** ${civicVsSocial.civic} civic / ${civicVsSocial.social} social events → keep the civic feed separate.\n`;
  md += `\n## Town highlight gaps (< 5 Tier-1 places)\n`;
  for (const t of highlightGaps) md += `- ${t.name}: ${t.tier1} Tier-1 (${t.places} places, ${t.events} upcoming events)\n`;
  md += `\n## Underfilled towns (< 20 places or 0 events)\n`;
  for (const t of underfilled) md += `- ${t.name}: ${t.places} places, ${t.events} events\n`;
  write("opportunities", md, data);
  return data;
}

// ── Orchestrate existing read-only scripts ──────────────────────────────
function runExisting() {
  const scripts: Array<[string, string]> = [
    ["places-data-audit", "scripts/audit-data.ts"],
    ["coords", "scripts/coord-audit.ts"],
    ["closures", "scripts/closures-report.ts"],
  ];
  const ran: string[] = [];
  for (const [name, path] of scripts) {
    try {
      const out = execSync(`npx tsx --tsconfig tsconfig.json ${path}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      writeFileSync(join(OUT, `${name}.txt`), out);
      ran.push(name);
    } catch {
      writeFileSync(join(OUT, `${name}.txt`), `(script ${path} failed to run)\n`);
    }
  }
  return ran;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const places = publicPlaces().map((p) => decoratePlace(p));
  // Readiness needs DECORATED events (geo_confidence; raw rows have no
  // placement). Take the loader's decorated upcoming set (social + civic),
  // then add back any raw rows it filtered out (past / undated) so the
  // tiering still sees the Tier-4 archive candidates. Deduped by slug.
  const decorated: Array<Event & { geo_confidence?: EventWithMeta["geo_confidence"] }> = [
    ...allUpcoming(NOW),
    ...civicUpcoming(NOW),
  ];
  const seen = new Set(decorated.map((e) => e.slug));
  const events: Array<Event & { geo_confidence?: EventWithMeta["geo_confidence"] }> = [
    ...decorated,
    ...RAW_EVENTS.filter((e) => !seen.has(e.slug)),
  ];

  const pr = placeReadiness(places);
  const er = eventReadiness(events);
  const st = staleReport(places, events);
  opportunityReport(places, events);
  const ran = runExisting();

  // Summary index.
  let md = `# Frederick Radius — data audit\n\nGenerated ${NOW.toISOString()}.\n\n`;
  md += `## Headline\n`;
  md += `- **Places:** ${pr.total} — Tier1 ${pr.counts[1]} (${pct(pr.counts[1], pr.total)}) · Tier2 ${pr.counts[2]} · Tier3 ${pr.counts[3]} · Tier4 ${pr.counts[4]}\n`;
  md += `- **Events:** ${er.total} (civic ${er.civic}) — Tier1 ${er.counts[1]} · Tier2 ${er.counts[2]} · Tier3 ${er.counts[3]} · Tier4 ${er.counts[4]}\n`;
  md += `- **Stale:** ${st.events.past_still_present} past events present · ${st.places.temporarily_closed} temp-closed places\n\n`;
  md += `## Reports\n`;
  md += `- places-readiness.md/json · events-readiness.md/json · stale.md/json · opportunities.md/json\n`;
  md += `- (orchestrated) ${ran.map((r) => r + ".txt").join(" · ")}\n`;
  writeFileSync(join(OUT, "README.md"), md);

  console.log("\n=== UNIFIED AUDIT COMPLETE → audit-reports/ ===\n");
  console.log(`Places ${pr.total}: T1 ${pr.counts[1]} (${pct(pr.counts[1], pr.total)}) · T2 ${pr.counts[2]} · T3 ${pr.counts[3]} · T4 ${pr.counts[4]}`);
  console.log(`Events ${er.total} (civic ${er.civic}): T1 ${er.counts[1]} · T2 ${er.counts[2]} · T3 ${er.counts[3]} · T4 ${er.counts[4]}`);
  console.log(`Stale: ${st.events.past_still_present} past events present`);
  console.log(`Reports: README.md, places-readiness, events-readiness, stale, opportunities (.md+.json) + ${ran.length} orchestrated (.txt)\n`);
}

main();
