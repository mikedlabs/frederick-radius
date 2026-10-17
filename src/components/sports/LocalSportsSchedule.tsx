import {
  ArrowUpRight,
  CalendarPlus,
  ChevronDown,
  MapPin,
  Radio,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import type { SportsGame } from "@/lib/sports/types";
import { SPORTS_TEAM_IDENTITIES, sportsTeamStyle } from "@/lib/sports/team-identity";
import styles from "./SportsIdentity.module.css";

const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});
const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

function matchup(game: SportsGame): string {
  if (game.homeAway === "away") return `at ${game.opponent}`;
  if (game.homeAway === "neutral") return `vs. ${game.opponent}`;
  return `vs. ${game.opponent}`;
}

function resultLine(game: SportsGame): string | null {
  if (game.state !== "final") return null;
  if (game.teamScore && game.opponentScore) {
    return `${game.result ?? "Final"} ${game.teamScore}–${game.opponentScore}`;
  }
  return game.result ?? "Final";
}

function placeLine(game: SportsGame): string {
  if (game.homeAway === "away") {
    return game.location ? `Away · ${game.location}` : "Away";
  }
  if (game.homeAway === "neutral") {
    return game.location ? `Neutral · ${game.location}` : "Neutral site";
  }
  return game.venue || game.location || "Home in Frederick County";
}

export default async function LocalSportsSchedule({
  gamesPromise,
  now,
}: {
  gamesPromise: Promise<SportsGame[]>;
  now: Date;
}) {
  const games = await gamesPromise.catch(() => []);
  const cutoff = now.getTime() - 6 * 60 * 60 * 1000;
  const rows = games
    .filter(
      (game) =>
        Date.parse(game.startsAt) >= cutoff &&
        game.state !== "cancelled" &&
        game.state !== "postponed",
    )
    .slice(0, 10);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="The next college schedules are not posted yet."
        body="Radius checks Hood, Mount St. Mary's, and FCC directly. The board will fill as their official calendars are published."
        cta={{ label: "See sports events", href: "/events?intent=sports" }}
      />
    );
  }

  return (
    <div className={styles.board}>
      <div className={styles.boardHeader}>
        <div>
          <p className={styles.boardHeading}>Official team feeds</p>
          <p className={styles.boardHint}>
            Home and away games are labeled before you open them.
          </p>
        </div>
        <a href="/api/calendar/sports.ics" className={styles.calendarAction}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Calendar
        </a>
      </div>

      <div>
        {rows.map((game) => {
          const starts = new Date(game.startsAt);
          const result = resultLine(game);
          const team = SPORTS_TEAM_IDENTITIES[game.teamId];
          return (
            <details key={game.id} className={styles.game} style={sportsTeamStyle(game.teamId)} data-sports-team={game.teamId}>
              <summary className={styles.gameSummary}>
                <span className={styles.gameMark} aria-hidden>{team.monogram}</span>
                <span className="min-w-0">
                  <span className={styles.gameKicker}>{game.teamName} · {game.sport}</span>
                  <strong className={styles.gameTeam}>
                    {game.teamNickname}
                    <span
                      className={styles.homeAway}
                      style={{
                        background: game.homeAway === "home" ? "var(--app-positive-tint-14)" : "var(--app-bg-sunken)",
                        color: game.homeAway === "home" ? "var(--state-open)" : "var(--app-ink-2)",
                      }}
                    >
                      {game.homeAway}
                    </span>
                  </strong>
                  <span className={styles.gameMatchup}>{matchup(game)}</span>
                  <span className={styles.gameWhen}>
                    <time dateTime={game.startsAt}>{DAY.format(starts)} {DATE.format(starts)}</time>
                    {" · "}
                    {result || (game.timeTba ? "Time TBA" : TIME.format(starts))}
                    {" · "}
                    {placeLine(game)}
                  </span>
                </span>
                <ChevronDown className={styles.gameChevron} aria-hidden />
              </summary>

              <div
                className="border-t px-4 pb-4 pt-3"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-sunken)",
                }}
              >
                <div
                  className="flex items-start gap-2 text-[11.5px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{placeLine(game)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {game.watchUrl && (
                    <a
                      href={game.watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-ink)",
                      }}
                    >
                      <Radio className="h-3.5 w-3.5" aria-hidden />
                      Watch
                    </a>
                  )}
                  {game.statsUrl && (
                    <a
                      href={game.statsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-full border px-3 text-[11px] font-semibold"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-ink)",
                      }}
                    >
                      Live stats
                    </a>
                  )}
                  {game.ticketsUrl && game.homeAway === "home" && (
                    <a
                      href={game.ticketsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-[11px] font-semibold"
                      style={{
                        background: "var(--app-ink)",
                        color: "var(--app-bg)",
                      }}
                    >
                      Home tickets
                    </a>
                  )}
                  <a
                    href={game.recapUrl || game.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[11px] font-semibold"
                    style={{ color: "var(--app-link)" }}
                  >
                    {game.recapUrl ? "Recap" : "Official listing"}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

export function LocalSportsScheduleFallback() {
  return (
    <div
      className="h-72 animate-pulse rounded-[var(--app-radius-lg)]"
      style={{ background: "var(--app-bg-sunken)" }}
      aria-hidden
    />
  );
}
