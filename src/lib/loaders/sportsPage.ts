import type { SportsGame } from "@/lib/sports/types";
import {
  assembleUnifiedEvents,
  type UnifiedEvents,
} from "@/lib/loaders/unifiedEvents";
import { getLocalSportsGames } from "@/lib/integrations/local-sports";
import { withDeadlineOutcome } from "@/lib/promise-deadline";

/**
 * The sports page streams both sections behind Suspense, but an ISR render
 * still has to finish before Next can publish the regenerated page. Keep a
 * final route-level ceiling around both independently bounded data systems so
 * a future provider or cache regression cannot hold that render for Vercel's
 * full function timeout.
 */
export const SPORTS_PAGE_DATA_DEADLINE_MS = 15_000;

export const EMPTY_SPORTS_EVENTS: UnifiedEvents = {
  unified: [],
  publicEvents: [],
  sourceHealth: {
    degraded: true,
    unavailable: ["sports and event schedules"],
  },
};

type SportsPageDependencies = {
  assembleUnifiedEvents: typeof assembleUnifiedEvents;
  getLocalSportsGames: typeof getLocalSportsGames;
};

const DEFAULT_DEPENDENCIES: SportsPageDependencies = {
  assembleUnifiedEvents,
  getLocalSportsGames,
};

async function boundedSportsRead<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  const outcome = await withDeadlineOutcome(
    promise,
    SPORTS_PAGE_DATA_DEADLINE_MS,
  );
  if (outcome.status === "fulfilled") return outcome.value;
  console.warn(
    `[sports-page] ${label} ${outcome.status} after ${SPORTS_PAGE_DATA_DEADLINE_MS}ms`,
  );
  return fallback;
}

export function loadSportsPageData(
  now: Date,
  dependencies: SportsPageDependencies = DEFAULT_DEPENDENCIES,
): {
  eventsPromise: Promise<UnifiedEvents>;
  localSportsPromise: Promise<SportsGame[]>;
} {
  return {
    eventsPromise: boundedSportsRead(
      "unified events",
      Promise.resolve().then(() => dependencies.assembleUnifiedEvents(now)),
      EMPTY_SPORTS_EVENTS,
    ),
    localSportsPromise: boundedSportsRead(
      "local schedules",
      Promise.resolve().then(() => dependencies.getLocalSportsGames(now)),
      [],
    ),
  };
}
