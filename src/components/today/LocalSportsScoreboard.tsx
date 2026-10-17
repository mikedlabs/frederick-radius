"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { SportsGame } from "@/lib/sports/types";
import { SPORTS_TEAM_IDENTITIES, sportsTeamStyle } from "@/lib/sports/team-identity";
import styles from "@/components/sports/SportsIdentity.module.css";

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

function gameStatus(game: SportsGame): string {
  if (
    game.state === "final" &&
    game.teamScore !== null &&
    game.opponentScore !== null
  ) {
    return `${game.result ?? "Final"} ${game.teamScore}–${game.opponentScore}`;
  }
  if (game.state === "final") return game.result ?? "Final";
  if (game.state === "live") return "Live";
  if (game.state === "postponed") return "Postponed";
  if (game.state === "cancelled") return "Cancelled";
  return game.timeTba ? "Time TBA" : TIME.format(new Date(game.startsAt));
}

export default function LocalSportsScoreboard() {
  const [games, setGames] = useState<SportsGame[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/sports/local", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { games: [] }))
      .then((payload: { games?: SportsGame[] }) => {
        if (active) setGames(Array.isArray(payload.games) ? payload.games : []);
      })
      .catch(() => {
        if (active) setGames([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!games?.length) return null;

  return (
    <section
      data-today-sports-card
      data-today-plan-rest-content
      className={`${styles.board} ${styles.scoreboard}`}
      aria-labelledby="local-sports-scoreboard-heading"
    >
      <div className={`${styles.boardHeader} ${styles.scoreboardHeader}`}>
        <h2
          id="local-sports-scoreboard-heading"
          className={styles.boardHeading}
        >
          Frederick teams today
        </h2>
        <Link
          href="/sports"
          className={styles.scoreLink}
        >
          All sports
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div>
        {games.map((game) => (
          <div
            key={game.id}
            className={styles.scoreRow}
            style={sportsTeamStyle(game.teamId)}
            data-sports-team={game.teamId}
          >
            <span className={styles.gameMark} aria-hidden>{SPORTS_TEAM_IDENTITIES[game.teamId].monogram}</span>
            <div className="min-w-0">
              <p className={styles.gameKicker}>{game.teamName} · {game.sport}</p>
              <p className={styles.gameTeam}>{game.teamNickname}</p>
              <p className={styles.gameMatchup}>
                {game.homeAway === "away" ? "at" : "vs."} {game.opponent}
              </p>
            </div>
            <div className={styles.scoreStatus}>
              <strong>{gameStatus(game)}</strong>
              <span>{game.homeAway === "away" ? "Away game" : game.homeAway === "neutral" ? "Neutral site" : "Home game"}</span>
              {game.homeAway === "home" && game.ticketsUrl && (
                <a
                  href={game.ticketsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.scoreLink}
                >
                  Home tickets
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
