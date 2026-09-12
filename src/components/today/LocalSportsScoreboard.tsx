"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { SportsGame } from "@/lib/sports/types";
import { SnapCarousel, SnapCarouselItem } from "@/components/ui/SnapCarousel";
import { motion } from "framer-motion";

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

function gameStatus(game: SportsGame): { text: string; isLive: boolean } {
  if (
    game.state === "final" &&
    game.teamScore !== null &&
    game.opponentScore !== null
  ) {
    return { text: `${game.result ?? "Final"}`, isLive: false };
  }
  if (game.state === "final") return { text: game.result ?? "Final", isLive: false };
  if (game.state === "live") return { text: "Live Now", isLive: true };
  if (game.state === "postponed") return { text: "Postponed", isLive: false };
  if (game.state === "cancelled") return { text: "Cancelled", isLive: false };
  return { text: game.timeTba ? "Time TBA" : TIME.format(new Date(game.startsAt)), isLive: false };
}

function getInitials(name: string) {
  const parts = name.split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function TeamAvatar({ name, isHome }: { name: string; isHome: boolean }) {
  const bg = isHome ? "var(--app-cool)" : "var(--app-bg-inset)";
  const color = isHome ? "var(--app-on-brand)" : "var(--app-ink-2)";
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold shadow-sm"
      style={{ backgroundColor: bg, color }}
    >
      {getInitials(name)}
    </div>
  );
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
      className="mt-3 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{
        borderColor: "var(--app-border)",
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

      <div className="-mx-6">
        <SnapCarousel className="px-6 pb-4 pt-4">
          {games.map((game) => {
            const status = gameStatus(game);
            const myScore = game.teamScore ?? "-";
            const opScore = game.opponentScore ?? "-";
            const teamName = game.teamNickname;
            const opName = game.opponent;
            const isHome = game.homeAway === "home";

            return (
              <SnapCarouselItem
                key={game.id}
                className="w-[260px] rounded-2xl border p-4 shadow-sm"
                style={{
                  borderColor: "var(--app-control-border)",
                  backgroundColor: "var(--app-bg-elevated)",
                }}
              >
                <div className="mb-3 flex items-center justify-between text-[11px] font-semibold">
                  <span style={{ color: "var(--app-ink-3)" }} className="uppercase tracking-wider">
                    {game.sport}
                  </span>
                  <div className="flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ backgroundColor: "var(--app-bg-inset)", color: "var(--app-ink)" }}>
                    {status.isLive && (
                      <motion.div
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="h-2 w-2 rounded-full bg-red-500"
                      />
                    )}
                    <span>{status.text}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TeamAvatar name={isHome ? opName : teamName} isHome={false} />
                      <span className="font-serif text-[18px] font-bold leading-tight" style={{ color: "var(--app-ink)" }}>
                        {isHome ? opName : teamName}
                      </span>
                    </div>
                    <span className="font-mono text-[22px] font-bold" style={{ color: "var(--app-ink)" }}>
                      {isHome ? opScore : myScore}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TeamAvatar name={isHome ? teamName : opName} isHome={true} />
                      <span className="font-serif text-[18px] font-bold leading-tight" style={{ color: "var(--app-ink)" }}>
                        {isHome ? teamName : opName}
                      </span>
                    </div>
                    <span className="font-mono text-[22px] font-bold" style={{ color: "var(--app-ink)" }}>
                      {isHome ? myScore : opScore}
                    </span>
                  </div>
                </div>

                {game.homeAway === "home" && game.ticketsUrl && (
                  <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                    <a
                      href={game.ticketsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-44 flex items-center justify-center gap-1 rounded-xl py-2 text-[13px] font-semibold transition-colors hover:bg-black/5"
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      Home tickets
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </a>
                  </div>
                )}
              </SnapCarouselItem>
            );
          })}
        </SnapCarousel>
      </div>
    </section>
  );
}
