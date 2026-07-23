"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { SportsGame } from "@/lib/sports/types";

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
      className="mt-3 overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge)",
      }}
      aria-labelledby="local-sports-scoreboard-heading"
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <h2
          id="local-sports-scoreboard-heading"
          className="text-[12px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Frederick teams today
        </h2>
        <Link
          href="/sports"
          className="tap-44 inline-flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          All sports
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {games.map((game) => (
          <div
            key={game.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <div
                className="flex flex-wrap items-center gap-x-1.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                <span>{game.teamNickname}</span>
                <span aria-hidden>·</span>
                <span>{game.sport}</span>
                <span aria-hidden>·</span>
                <span>{game.homeAway}</span>
              </div>
              <p
                className="mt-0.5 truncate text-[13px] font-semibold"
                style={{ color: "var(--app-ink)" }}
              >
                {game.homeAway === "away" ? "at" : "vs."} {game.opponent}
              </p>
            </div>
            <div className="text-right">
              <strong
                className="block font-mono text-[11px]"
                style={{ color: "var(--app-ink)" }}
              >
                {gameStatus(game)}
              </strong>
              {game.homeAway === "home" && game.ticketsUrl ? (
                <a
                  href={game.ticketsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 inline-flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  Home tickets
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </a>
              ) : (
                <span
                  className="block text-[10px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {game.homeAway === "away"
                    ? "Away game"
                    : game.homeAway === "neutral"
                      ? "Neutral site"
                      : "Local game"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
