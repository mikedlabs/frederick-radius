import { INTENTS, type IntentKey } from "@/data/intents";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { isLikelyOpenNow } from "@/data/reliable-open-windows";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { mayUseLikelyOpenFallback } from "@/lib/likely-open";
import { scopeLabel, scopeTownSlug, type Scope } from "@/lib/scope";
import type { SearchResult } from "@/lib/search/index";
import { RADIUS_M } from "./constants";
import type { EventPin, MapPinPlace } from "./types";
import type { MapViewportBounds } from "./mapViewportCommit";

/**
 * The map's task model. The interaction contract says a task returns a small
 * ranked set of candidates, not pins alone (docs/USER_FIRST_INTERACTION_
 * CONTRACT.md, Map). This module decides which task is active, which places
 * or events belong to it, and how the ranked list reads, so AppMap and the
 * dock share one answer and the rules stay testable without Mapbox.
 */

/** URL key for the tile tasks that have no existing intent or time param. */
export const MAP_TASK_PARAM = "task";

/** Rows the list shows before "Show more". */
export const MAP_TASK_LIST_PAGE = 5;

/** Map search asks the server for its maximum so a submitted query has
 * enough candidates to rank, page through, and draw. */
export const MAP_SEARCH_RESULT_LIMIT = 20;

export type MapTaskId =
  | "eat"
  | "coffee"
  | "drinks"
  | "parks-trails"
  | "likely-open"
  | "events-tonight";

/** Tasks that the URL's intent and time params cannot express. */
export type MapClientTaskId = Extract<
  MapTaskId,
  "drinks" | "parks-trails" | "likely-open"
>;

export const MAP_TASK_TILES: ReadonlyArray<{ id: MapTaskId; label: string }> = [
  { id: "eat", label: "Eat & drink" },
  { id: "coffee", label: "Coffee" },
  { id: "drinks", label: "Drinks" },
  { id: "parks-trails", label: "Parks & trails" },
  { id: "likely-open", label: "Likely open now" },
  { id: "events-tonight", label: "Events tonight" },
];

const CLIENT_TASK_IDS: ReadonlySet<string> = new Set([
  "drinks",
  "parks-trails",
  "likely-open",
]);

export function mapTaskLabel(id: MapTaskId): string {
  return MAP_TASK_TILES.find((tile) => tile.id === id)?.label ?? id;
}

export function parseMapClientTask(
  value: string | null | undefined,
): MapClientTaskId | null {
  return value && CLIENT_TASK_IDS.has(value) ? (value as MapClientTaskId) : null;
}

/** Which tile is lit for the current map state. A narrower URL filter (a
 * sub-category, Open now, Deals) is a different view, so its parent tile is
 * not shown as the active one. */
export function activeMapTask(state: {
  clientTask: MapClientTaskId | null;
  intentKey?: string;
  subKey?: string;
  openNow?: boolean;
  dealsOn?: boolean;
  musicTonight?: boolean;
  timeModeExplicit?: boolean;
  timeMode?: string;
}): MapTaskId | null {
  if (state.clientTask) return state.clientTask;
  const plainIntent = !state.subKey && !state.openNow && !state.dealsOn;
  if (plainIntent && (state.intentKey === "eat" || state.intentKey === "coffee")) {
    return state.intentKey;
  }
  if (
    !state.intentKey &&
    !state.musicTonight &&
    state.timeModeExplicit &&
    state.timeMode === "tonight"
  ) {
    return "events-tonight";
  }
  return null;
}

/** Start one task, or clear every task with null. Tasks are mutually
 * exclusive and never touch the header scope (`in`), camera, or layers. */
export function applyMapTaskToParams(
  params: URLSearchParams,
  id: MapTaskId | null,
): void {
  for (const key of ["intent", "sub", "open", "deals", "music", "t", "q", MAP_TASK_PARAM]) {
    params.delete(key);
  }
  if (id === "eat" || id === "coffee") params.set("intent", id);
  else if (id === "events-tonight") params.set("t", "tonight");
  else if (id) params.set(MAP_TASK_PARAM, id);
}

/** Start an existing intent (and optional sub-intent) as the one task. */
export function applyMapIntentToParams(
  params: URLSearchParams,
  intentKey: IntentKey,
  subKey?: string,
): void {
  applyMapTaskToParams(params, null);
  params.set("intent", intentKey);
  if (subKey) params.set("sub", subKey);
}

// ── Query routing ──────────────────────────────────────────────────────────

export type MapQueryRoute =
  | { kind: "task"; task: MapTaskId }
  | { kind: "intent"; intentKey: IntentKey; subKey?: string }
  | { kind: "search" };

export function normalizeMapQuery(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Words that may surround "open" without changing the request. Anything
 * else ("open mic", "coffee open now") stays a normal search, where the
 * server's own qualifiers apply. */
const OPEN_NOW_WORDS = new Set([
  "what", "whats", "is", "are", "anything", "places", "place", "spots",
  "still", "likely", "now", "right", "late", "tonight", "today", "nearby",
  "near", "me", "the",
]);

const TONIGHT_WORDS = new Set([
  "what", "whats", "is", "on", "happening", "going", "things", "to", "do",
  "events", "event", "shows", "anything", "the",
]);

function plurals(word: string): string[] {
  const forms = [word, `${word}s`];
  if (word.endsWith("y")) forms.push(`${word.slice(0, -1)}ies`);
  return forms;
}

/** The single-tile and catalog names a query may name exactly. */
function intentRoute(normalized: string): MapQueryRoute | null {
  const forms = plurals(normalized);
  const matches = (label: string) => forms.includes(normalizeMapQuery(label));

  if (forms.includes("drinks")) return { kind: "task", task: "drinks" };
  if (matches("Parks & trails")) return { kind: "task", task: "parks-trails" };
  for (const intent of INTENTS) {
    if (matches(intent.label) || matches(intent.key)) {
      if (intent.key === "eat" || intent.key === "coffee") {
        return { kind: "task", task: intent.key };
      }
      return { kind: "intent", intentKey: intent.key };
    }
  }
  for (const intent of INTENTS) {
    const sub = intent.subIntents?.find((candidate) => matches(candidate.label));
    if (sub) return { kind: "intent", intentKey: intent.key, subKey: sub.key };
  }
  return null;
}

/**
 * Decide what Enter means for a typed query. "Open now" and "open late"
 * become the likely-open set (/open-now's rule and label), "tonight" becomes
 * the event window, an exact category name becomes that category, and
 * everything else stays a ranked search.
 */
export function mapQueryRoute(query: string): MapQueryRoute {
  const normalized = normalizeMapQuery(query);
  if (normalized.length < 2) return { kind: "search" };
  const words = normalized.split(" ");

  if (
    words.includes("open") &&
    words.every((word) => word === "open" || OPEN_NOW_WORDS.has(word))
  ) {
    return { kind: "task", task: "likely-open" };
  }
  if (
    words.includes("tonight") &&
    words.every((word) => word === "tonight" || TONIGHT_WORDS.has(word))
  ) {
    return { kind: "task", task: "events-tonight" };
  }
  return intentRoute(normalized) ?? { kind: "search" };
}

/** A non-place command (a town, a map layer, a scene) answers Enter by
 * itself; a ranked list of places would not help. */
export function isMapCommandResult(result: SearchResult | undefined): boolean {
  if (!result) return false;
  return (
    result.type === "municipality" ||
    result.id.startsWith("layer:") ||
    (result.type === "action" && result.id.startsWith("action:map-"))
  );
}

// ── Task place sets ────────────────────────────────────────────────────────

function intentByKey(key: IntentKey) {
  return INTENTS.find((intent) => intent.key === key);
}

function subMatch(intentKey: IntentKey, subKey: string, place: MapPinPlace): boolean {
  const intent = intentByKey(intentKey);
  const sub = intent?.subIntents?.find((candidate) => candidate.key === subKey);
  return Boolean(intent && sub && intent.match(place) && sub.match(place));
}

/** /open-now's likely-open rule: confirmed open, or a curated posted-hours
 * window that covers this minute for a place whose hours are not confirmed. */
export function isLikelyOpenPlace(place: MapPinPlace, now: Date): boolean {
  if (isOpenNow(place.open_status)) return true;
  return mayUseLikelyOpenFallback(place.open_status) && isLikelyOpenNow(place.slug, now);
}

export function mapClientTaskMatches(
  id: MapClientTaskId,
  place: MapPinPlace,
  now: Date,
): boolean {
  switch (id) {
    case "drinks":
      return (
        subMatch("eat", "bars", place) ||
        Boolean(intentByKey("breweries")?.match(place)) ||
        Boolean(intentByKey("wineries")?.match(place))
      );
    case "parks-trails":
      return subMatch("outdoor", "parks", place) || subMatch("outdoor", "trails", place);
    case "likely-open":
      return isLikelyOpenPlace(place, now);
  }
}

export function placesForMapClientTask<T extends MapPinPlace>(
  places: readonly T[],
  id: MapClientTaskId,
  now: Date,
): T[] {
  return places.filter((place) => mapClientTaskMatches(id, place, now));
}

// ── Scope and area ─────────────────────────────────────────────────────────

/** Events without a known venue place count toward a town within this reach
 * of its centroid. */
const TOWN_EVENT_METERS = 4000;

function inArea(point: LngLat, area: MapViewportBounds | null): boolean {
  return (
    !area ||
    (point.lng >= area.west &&
      point.lng <= area.east &&
      point.lat >= area.south &&
      point.lat <= area.north)
  );
}

export function placeInMapScope(
  place: MapPinPlace,
  scope: Scope,
  userLoc: LngLat | null,
): boolean {
  const town = scopeTownSlug(scope);
  if (town) return place.municipality === town;
  if (scope === "nearme" && userLoc) {
    return haversineMeters(userLoc, place.geom) <= RADIUS_M;
  }
  return true;
}

export function eventInMapScope(
  event: EventPin,
  scope: Scope,
  userLoc: LngLat | null,
  placesBySlug: ReadonlyMap<string, MapPinPlace>,
): boolean {
  const point = { lng: event.lng, lat: event.lat };
  const town = scopeTownSlug(scope);
  if (town) {
    const venue = event.venue_place_slug
      ? placesBySlug.get(event.venue_place_slug)
      : undefined;
    if (venue) return venue.municipality === town;
    const centroid = MUNICIPALITY_BY_SLUG[town]?.centroid;
    return Boolean(centroid && haversineMeters(centroid, point) <= TOWN_EVENT_METERS);
  }
  if (scope === "nearme" && userLoc) {
    return haversineMeters(userLoc, point) <= RADIUS_M;
  }
  return true;
}

// ── Ranking ────────────────────────────────────────────────────────────────

/**
 * With a real location fix the nearest place leads. Without one there is no
 * honest distance, so places that can say something lead: confirmed open,
 * then a description, then checked field notes, then verified listings. The
 * catalog's own order breaks ties.
 */
export function rankMapTaskPlaces<T extends MapPinPlace>(
  places: readonly T[],
  userLoc: LngLat | null,
): T[] {
  const indexed = places.map((place, index) => ({ place, index }));
  if (userLoc) {
    return indexed
      .map((entry) => ({
        ...entry,
        distance: haversineMeters(userLoc, entry.place.geom),
      }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .map(({ place }) => place);
  }
  const score = (place: MapPinPlace) =>
    (isOpenNow(place.open_status) ? 8 : 0) +
    (place.short_blurb?.trim() ? 4 : 0) +
    (place.field_notes ? 2 : 0) +
    (place.is_verified ? 1 : 0);
  return indexed
    .sort(
      (a, b) =>
        score(b.place) - score(a.place) ||
        (b.place.feature_score ?? 0) - (a.place.feature_score ?? 0) ||
        a.index - b.index,
    )
    .map(({ place }) => place);
}

export function rankMapTaskEvents(events: readonly EventPin[]): EventPin[] {
  return events
    .map((event, index) => ({ event, index, starts: Date.parse(event.starts_at) }))
    .sort(
      (a, b) =>
        (Number.isFinite(a.starts) ? a.starts : Infinity) -
          (Number.isFinite(b.starts) ? b.starts : Infinity) ||
        a.index - b.index,
    )
    .map(({ event }) => event);
}

// ── The list ───────────────────────────────────────────────────────────────

export type MapTaskListRow =
  | { kind: "place"; place: MapPinPlace }
  | { kind: "event"; event: EventPin };

export type MapTaskList = {
  /** Changes whenever a different task starts, so paging resets. */
  key: string;
  title: string;
  note: string | null;
  rows: MapTaskListRow[];
  unit: "place" | "event";
  pending: boolean;
  empty: { title: string; copy: string };
  /** A query with no local answer offers one fallback. */
  askQuery: string | null;
};

export type MapTaskListInput = {
  scope: Scope;
  userLoc: LngLat | null;
  /** Bounds from "Search this area", or null for the whole header scope. */
  area: MapViewportBounds | null;
  now: Date;
  /** The submitted query and the search results it settled on. */
  query: { text: string; results: readonly SearchResult[]; pending: boolean } | null;
  clientTask: MapClientTaskId | null;
  /** A URL place filter (intent, sub-intent, Open now, Deals) and its name. */
  placeFilterLabel: string | null;
  /** The map's curated source after the active filter. */
  places: readonly MapPinPlace[];
  placesBySlug: ReadonlyMap<string, MapPinPlace>;
  /** An explicit event window, named for the list ("Events tonight"). */
  eventListLabel: string | null;
  events: readonly EventPin[];
};

const LIKELY_OPEN_NOTE =
  "These places are usually open at this hour based on their posted schedules. Check before you go.";
const UNCONFIRMED_HOURS_NOTE =
  "Hours for these places are not confirmed, so check before you go.";

function hoursNote(rows: readonly MapTaskListRow[]): string | null {
  const places = rows.flatMap((row) => (row.kind === "place" ? [row.place] : []));
  if (places.length === 0) return null;
  const undecided = places.every(
    (place) =>
      place.open_status.state === "unknown" ||
      place.open_status.state === "unverified",
  );
  return undecided ? UNCONFIRMED_HOURS_NOTE : null;
}

function areaEmpty(area: MapViewportBounds | null) {
  return area
    ? {
        title: "Nothing matches in this part of the map.",
        copy: "Move the map and search this area again, or choose Whole county.",
      }
    : null;
}

/** Build the ranked list for whatever task is active, or null at rest. */
export function buildMapTaskList(input: MapTaskListInput): MapTaskList | null {
  const where = input.area ? "This area" : scopeLabel(input.scope);
  const inScope = (place: MapPinPlace) =>
    placeInMapScope(place, input.scope, input.userLoc) &&
    inArea(place.geom, input.area);
  const areaKey = input.area
    ? `${input.area.west.toFixed(4)},${input.area.south.toFixed(4)},${input.area.east.toFixed(4)},${input.area.north.toFixed(4)}`
    : input.scope;

  if (input.query) {
    const seen = new Set<string>();
    const rows: MapTaskListRow[] = [];
    for (const result of input.query.results) {
      if (result.type !== "place" || result.temporary) continue;
      const place = input.placesBySlug.get(result.id.replace(/^place:/, ""));
      if (!place || seen.has(place.slug) || !inScope(place)) continue;
      seen.add(place.slug);
      rows.push({ kind: "place", place });
    }
    const text = input.query.text;
    return {
      key: `query:${text}:${areaKey}`,
      title: `“${text}” · ${where}`,
      note: hoursNote(rows),
      rows,
      unit: "place",
      pending: input.query.pending && rows.length === 0,
      empty: areaEmpty(input.area) ?? {
        title: `Nothing on this map matches “${text}.”`,
        copy: "Radius can still search every listing and event for it.",
      },
      askQuery: text,
    };
  }

  if (input.clientTask) {
    const rows = rankMapTaskPlaces(
      placesForMapClientTask(input.places, input.clientTask, input.now).filter(inScope),
      input.userLoc,
    ).map((place): MapTaskListRow => ({ kind: "place", place }));
    const likely = input.clientTask === "likely-open";
    return {
      key: `task:${input.clientTask}:${areaKey}`,
      title: `${mapTaskLabel(input.clientTask)} · ${where}`,
      note: likely
        ? rows.length > 0
          ? LIKELY_OPEN_NOTE
          : null
        : input.clientTask === "parks-trails"
          ? null
          : hoursNote(rows),
      rows,
      unit: "place",
      pending: false,
      empty: areaEmpty(input.area) ??
        (likely
          ? {
              title: "No places are likely open right now.",
              copy: "Radius has no posted schedules that cover this hour. Try again later or choose another view.",
            }
          : {
              title: "Nothing here matches this view.",
              copy: "Choose another view or reset the map.",
            }),
      askQuery: null,
    };
  }

  if (input.placeFilterLabel) {
    const rows = rankMapTaskPlaces(input.places.filter(inScope), input.userLoc).map(
      (place): MapTaskListRow => ({ kind: "place", place }),
    );
    return {
      key: `filter:${input.placeFilterLabel}:${areaKey}`,
      title: `${input.placeFilterLabel} · ${where}`,
      note: hoursNote(rows),
      rows,
      unit: "place",
      pending: false,
      empty: areaEmpty(input.area) ?? {
        title: "Nothing here matches this view.",
        copy: "Choose another view or reset the map.",
      },
      askQuery: null,
    };
  }

  if (input.eventListLabel) {
    const rows = rankMapTaskEvents(
      input.events.filter(
        (event) =>
          eventInMapScope(event, input.scope, input.userLoc, input.placesBySlug) &&
          inArea({ lng: event.lng, lat: event.lat }, input.area),
      ),
    ).map((event): MapTaskListRow => ({ kind: "event", event }));
    return {
      key: `events:${input.eventListLabel}:${areaKey}`,
      title: `${input.eventListLabel} · ${where}`,
      note: null,
      rows,
      unit: "event",
      pending: false,
      empty: areaEmpty(input.area) ?? {
        title: "No events are mapped for this time.",
        copy: "Choose another time in Happening, or check the events board.",
      },
      askQuery: null,
    };
  }

  return null;
}
