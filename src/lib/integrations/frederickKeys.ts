/**
 * Frederick Keys (minor-league baseball) -> live events from the keyless MLB
 * Stats API (statsapi.mlb.com).
 *
 * The Keys already arrive via Ticketmaster sports, but only when
 * TICKETMASTER_API_KEY is set and only as long as TM lists the game. This adds
 * the authoritative schedule as a RELIABILITY/RICHNESS layer: real first-pitch
 * times, the stadium coordinate (a precise distance, not "area"), and game
 * status (postponed/cancelled). It DEDUPES against Ticketmaster purely on the
 * clean slug (kebab(presenter+title)-YYYY-MM-DD) — the unified assembly's
 * bySlug map collapses the same game, and the wiring lists Ticketmaster first
 * so its richer ticket row wins; the Keys feed only contributes net-new games.
 *
 * HOME GAMES ONLY: this is a Frederick County field guide, so a Keys away game
 * in Brooklyn is not a local event. We keep only games where the Keys are the
 * home team (played at Nymeo Field at Harry Grove Stadium, Frederick).
 *
 * Discovery (run 2026-06-29, then hardcoded): statsapi `/api/v1/teams?search=Keys`
 * → Frederick Keys is team id 493; their schedule is served under sportId 13.
 * If those ids ever stop returning games, fetchFrederickKeys yields [] and
 * Ticketmaster continues to cover the Keys — no regression.
 *
 * Confidence is `verified` (statsapi is authoritative for schedule). Keyless,
 * fail-soft to []; the pure normalizer is exported for unit testing.
 */
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { cleanFeedText } from "@/lib/format/text";

const STATSAPI = "https://statsapi.mlb.com/api/v1/schedule";
const KEYS_TEAM_ID = 493;
const KEYS_SPORT_ID = 13;
const FETCH_TIMEOUT_MS = 15_000;
const SOURCE_LABEL = "Frederick Keys";
// Nymeo Field at Harry Grove Stadium, 21 Stadium Dr, Frederick, MD 21703.
// statsapi venue records carry no coordinate, so the stadium is hardcoded; it
// is well clear of any town centroid, so placement "geocoded" -> a real distance.
const NYMEO_FIELD = {
  name: "Nymeo Field at Harry Grove Stadium",
  address: "21 Stadium Dr, Frederick, MD 21703",
  geom: { lng: -77.4179, lat: 39.408 },
};
// How long to treat a game as "on" for windowing (statsapi gives no end time).
const GAME_DURATION_MS = 3 * 60 * 60 * 1000;

type StatsApiTeam = { team?: { id?: number; name?: string } };
type StatsApiGame = {
  gamePk?: number;
  gameDate?: string;
  status?: { detailedState?: string };
  teams?: { home?: StatsApiTeam; away?: StatsApiTeam };
  venue?: { name?: string };
};
type StatsApiSchedule = { dates?: Array<{ games?: StatsApiGame[] }> };

function mapStatus(detailed: string | undefined): LiveEvent["status"] {
  const s = (detailed ?? "").toLowerCase();
  if (/cancel/.test(s)) return "cancelled";
  if (/postpon|suspend/.test(s)) return "postponed";
  return "scheduled";
}

/**
 * Pure: normalize a statsapi schedule response into LiveEvent[], keeping only
 * Frederick Keys HOME games. Exported for unit testing with no network. `now`
 * is currently unused (statsapi is queried by date window), accepted for parity
 * with the other normalizers and future windowing.
 */
export function normalizeStatsApiSchedule(
  raw: unknown,
  opts: { teamId?: number } = {},
): LiveEvent[] {
  const teamId = opts.teamId ?? KEYS_TEAM_ID;
  const dates = (raw as StatsApiSchedule)?.dates;
  if (!Array.isArray(dates)) return [];
  const out: LiveEvent[] = [];
  for (const d of dates) {
    for (const g of d.games ?? []) {
      const home = g.teams?.home?.team;
      const away = g.teams?.away?.team;
      const when = g.gameDate;
      if (!g.gamePk || !when || home?.id !== teamId || !away?.name) continue; // home games only
      const start = Date.parse(when);
      if (!Number.isFinite(start)) continue;
      const homeName = home?.name ?? "Frederick Keys";
      out.push({
        id: `keys-${g.gamePk}`,
        // Mirror Ticketmaster's "Frederick Keys vs. <Opponent>" so the clean
        // slug collides and the two sources dedupe to one card. Run through the
        // boundary cleaner like every other source (decode/whitespace; a no-op
        // on clean team names).
        title: cleanFeedText(`${homeName} vs. ${away.name}`),
        description: "",
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(start + GAME_DURATION_MS).toISOString(),
        venue_name: NYMEO_FIELD.name,
        address: NYMEO_FIELD.address,
        geom: { lng: NYMEO_FIELD.geom.lng, lat: NYMEO_FIELD.geom.lat },
        placement: "geocoded",
        municipality: "frederick",
        category: "sports",
        organizer: SOURCE_LABEL,
        source: "frederick-keys",
        source_label: SOURCE_LABEL,
        url: "https://www.milb.com/frederick/schedule",
        is_free: false,
        status: mapStatus(g.status?.detailedState),
        last_verified_at: new Date().toISOString(),
      });
    }
  }
  return out;
}

/**
 * Fetch the Frederick Keys schedule (next ~120 days) from statsapi. Keyless,
 * fail-soft to [] on any network/parse error, HTTP-cached (revalidate 3600).
 */
export async function fetchFrederickKeys(now: Date = new Date()): Promise<LiveEvent[]> {
  const start = now.toISOString().slice(0, 10);
  const endMs = now.getTime() + 120 * 24 * 60 * 60 * 1000;
  const end = new Date(endMs).toISOString().slice(0, 10);
  const url =
    `${STATSAPI}?sportId=${KEYS_SPORT_ID}&teamId=${KEYS_TEAM_ID}` +
    `&startDate=${start}&endDate=${end}&hydrate=team,venue`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[frederick-keys] HTTP ${res.status}`);
      return [];
    }
    return normalizeStatsApiSchedule(await res.json());
  } catch (err) {
    console.warn("[frederick-keys] fetch failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
