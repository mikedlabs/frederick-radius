/**
 * Frederick Keys LIVE score — today's game state from the keyless MLB Stats
 * API (statsapi.mlb.com), the live counterpart to frederickKeys.ts.
 *
 * frederickKeys.ts turns the schedule into calendar EVENTS (home games only,
 * for the field guide's "what's on"). This is different: fans want the score of
 * TONIGHT'S game while it's happening, home OR away — a Keys away game is still
 * "our team." So this covers both, keyed on team 493 appearing on either side.
 *
 * The schedule endpoint hydrated with `linescore` carries everything a score
 * card needs in one keyless call: status.abstractGameState (Live/Final/Preview),
 * each side's runs (teams.{home,away}.score), and the linescore
 * (currentInningOrdinal, inningState, outs). Verified live 2026-07-03.
 *
 * Pure normalizer exported for tests; the fetch fails soft to null. Cached
 * short (30s) so a live inning is never more than ~30s stale, while the edge
 * collapses the poll traffic from every open /today.
 */
import { easternDayKey } from "@/lib/tz";
import { createSingleFlight } from "@/lib/single-flight";
import { unstable_cache } from "next/cache";

const STATSAPI = "https://statsapi.mlb.com/api/v1/schedule";
const KEYS_TEAM_ID = 493;
const KEYS_SPORT_ID = 13;
const FETCH_TIMEOUT_MS = 4_000;
const SCHEDULE_URL = "https://www.milb.com/frederick/schedule";

export type KeysScoreState = "live" | "final" | "pre" | "postponed" | "cancelled";

export type KeysScore = {
  gamePk: number;
  state: KeysScoreState;
  /** The raw statsapi detailedState, for a precise label ("Warmup", "Delayed"). */
  detailedState: string;
  /** True when the Keys are the home side (played at Nymeo Field). */
  keysHome: boolean;
  /** The Keys, then the opponent. `runs` is null before first pitch. */
  keys: { name: string; runs: number | null };
  opponent: { name: string; runs: number | null };
  /** Live-only: "7th", "Top" | "Bottom" | "Middle" | "End", outs. */
  inningOrdinal: string | null;
  inningState: string | null;
  outs: number | null;
  /** ISO first-pitch time (for the pre-game teaser). */
  startsAt: string;
  /** The official schedule/box-score link. */
  url: string;
};

type ApiTeamSide = {
  team?: { id?: number; name?: string };
  score?: number;
};
type ApiLinescore = {
  currentInningOrdinal?: string;
  inningState?: string;
  outs?: number;
};
type ApiGame = {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { home?: ApiTeamSide; away?: ApiTeamSide };
  linescore?: ApiLinescore;
};
type ApiSchedule = { dates?: Array<{ games?: ApiGame[] }> };

function deriveState(abstract: string | undefined, detailed: string | undefined): KeysScoreState {
  const d = (detailed ?? "").toLowerCase();
  if (/cancel/.test(d)) return "cancelled";
  if (/postpon|suspend/.test(d)) return "postponed";
  const a = (abstract ?? "").toLowerCase();
  if (a === "live") return "live";
  if (a === "final") return "final";
  return "pre";
}

/**
 * Pure: pick today's Keys game out of a statsapi schedule response and shape it
 * into a KeysScore. When a doubleheader yields two games, prefer a LIVE one,
 * else the latest by first pitch (the one people are watching now). Returns null
 * when no game involves the Keys. Exported for unit testing (no network).
 */
export function normalizeKeysScore(raw: unknown, opts: { teamId?: number } = {}): KeysScore | null {
  const teamId = opts.teamId ?? KEYS_TEAM_ID;
  const dates = (raw as ApiSchedule)?.dates;
  if (!Array.isArray(dates)) return null;

  const candidates: KeysScore[] = [];
  for (const d of dates) {
    for (const g of d.games ?? []) {
      const home = g.teams?.home;
      const away = g.teams?.away;
      const homeId = home?.team?.id;
      const awayId = away?.team?.id;
      if (!g.gamePk || !g.gameDate) continue;
      if (homeId !== teamId && awayId !== teamId) continue; // not a Keys game

      const keysHome = homeId === teamId;
      const keysSide = keysHome ? home : away;
      const oppSide = keysHome ? away : home;
      const state = deriveState(g.status?.abstractGameState, g.status?.detailedState);
      const runsOf = (s: ApiTeamSide | undefined): number | null =>
        typeof s?.score === "number" ? s.score : null;

      candidates.push({
        gamePk: g.gamePk,
        state,
        detailedState: g.status?.detailedState ?? "",
        keysHome,
        keys: { name: keysSide?.team?.name ?? "Frederick Keys", runs: runsOf(keysSide) },
        opponent: { name: oppSide?.team?.name ?? "Opponent", runs: runsOf(oppSide) },
        inningOrdinal: state === "live" ? g.linescore?.currentInningOrdinal ?? null : null,
        inningState: state === "live" ? g.linescore?.inningState ?? null : null,
        outs: state === "live" && typeof g.linescore?.outs === "number" ? g.linescore.outs : null,
        startsAt: g.gameDate,
        url: SCHEDULE_URL,
      });
    }
  }
  if (candidates.length === 0) return null;
  const live = candidates.find((c) => c.state === "live");
  if (live) return live;
  return candidates.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
}

async function loadKeysScoreForDay(day: string): Promise<KeysScore | null> {
  const url =
    `${STATSAPI}?sportId=${KEYS_SPORT_ID}&teamId=${KEYS_TEAM_ID}` +
    `&startDate=${day}&endDate=${day}&hydrate=team,linescore`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 30 } });
    if (!res.ok) {
      console.info(
        `[keys-score] unavailable this refresh (HTTP ${res.status}; fail-soft)`,
      );
      return null;
    }
    return normalizeKeysScore(await res.json());
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    console.info(
      `[keys-score] unavailable this refresh (${timedOut ? `timed out after ${FETCH_TIMEOUT_MS}ms` : err instanceof Error ? err.message : String(err)}; fail-soft)`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The beta page is dynamic and the Today score endpoint is polled. A failed
// statsapi response is not retained by Next's fetch cache, so without caching
// the normalized result every consumer retried the same connection reset.
// Cache null as a real fail-soft result for the 30-second score window.
const loadKeysScoreOnce = createSingleFlight<string, KeysScore | null>();
const getKeysScoreCached = unstable_cache(
  (day: string) =>
    loadKeysScoreOnce(
      day,
      () => loadKeysScoreForDay(day),
    ),
  [
    "frederick-keys-score-v1",
    process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  ],
  { revalidate: 30, tags: ["frederick-keys-score"] },
);

/** Today's (Eastern) Keys game score, or null. Keyless and fail-soft. */
export function getKeysScoreToday(
  now: Date = new Date(),
): Promise<KeysScore | null> {
  const day = easternDayKey(now);
  if (process.env.NODE_ENV === "test") {
    return loadKeysScoreOnce(
      day,
      () => loadKeysScoreForDay(day),
    );
  }
  return getKeysScoreCached(day);
}
