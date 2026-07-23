"use client";

/**
 * KeysScore — tonight's Frederick Keys game, live on /today.
 *
 * Fetches /api/sports/keys on mount and, WHILE a game is live, re-polls every
 * 45s so the score and inning update without a page refresh (the score card is
 * the one genuinely live-updating surface on the page). Self-hides entirely
 * when there's no Keys game today — a client island that costs an idle day
 * zero space. Covers home AND away games: an away Keys game is still our team.
 *
 * Dressed in the TEAM's colors (navy plate, red/gold accents, cream numerals) —
 * the same deliberate branded exception KeysCard takes, so the live score reads
 * as a Keys card, not a generic stat box. Scores stay in the mono data voice; a
 * final game keeps showing through the rest of the day so fans who missed it get
 * the result; a pre-game shows only the first-pitch time.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { track } from "@/lib/track";
import LiveCountdown from "@/components/ui/LiveCountdown";
import type { KeysScore as Score } from "@/lib/integrations/keysScore";

const POLL_MS = 45_000;

// Frederick Keys team palette — the deliberate branded exception (a team card's
// whole point is the team's own orange/black, which the app tokens don't
// carry). Kept in sync with KeysCard.
// The Keys in their HOME WHITES: a warm-white plate carrying the team's
// orange (owner call — the dark plate fought the cream page; white-and-orange
// is the look everyone knows from the ballpark). DEEP is the text-safe orange
// (AA on the white plate, and the fill under white text); the pure brand
// orange carries the graphic moments (pennant, stitches, watermark).
const PLATE = "#FFFCF5";
const PLATE_DEEP = "#F5EEDF";
const KEYS_ORANGE = "#DF4601";
const KEYS_ORANGE_DEEP = "#C23D00";
const INK = "#1A150E";

/** The official Keys ticket page — the stable fallback when a game has no
 *  per-game Ticketmaster link (the score payload carries none). */
const KEYS_TICKETS_URL = "https://www.milb.com/frederick/tickets";

/**
 * Tickets only make sense when the Keys are playing at Nymeo Field. Away
 * games keep an official, non-commerce action so the card never implies that
 * Frederick tickets apply at the opponent's ballpark.
 */
export function keysScoreAction(
  score: Pick<Score, "keysHome" | "state" | "url">,
): { href: string; label: string; isTickets: boolean } {
  if (score.keysHome && score.state === "pre") {
    return { href: KEYS_TICKETS_URL, label: "Home game tickets", isTickets: true };
  }
  return { href: score.url, label: "Official Keys schedule", isTickets: false };
}

function firstPitch(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(t);
}

function statusChip(s: Score): { text: string; live: boolean } {
  switch (s.state) {
    case "live":
      return { text: "Live", live: true };
    case "final":
      return { text: "Final", live: false };
    case "postponed":
      return { text: "Postponed", live: false };
    case "cancelled":
      return { text: "Cancelled", live: false };
    default:
      return { text: "Tonight", live: false };
  }
}

/** The under-score line: inning for live, first pitch for pre, venue for final. */
function detailLine(s: Score): string {
  const location = s.keysHome ? "Home at Nymeo Field" : "Away game";
  if (s.state === "live") {
    const inning = [s.inningState, s.inningOrdinal].filter(Boolean).join(" ");
    const outs = s.outs != null ? `${s.outs} out` : "";
    return [inning, outs, location].filter(Boolean).join(" · ");
  }
  if (s.state === "pre") {
    const t = firstPitch(s.startsAt);
    return [t ? `First pitch ${t}` : "Today", location].join(" · ");
  }
  if (s.state === "postponed") return "The game was postponed, so check the official page.";
  if (s.state === "cancelled") return "The game was called off.";
  // final
  return location;
}

function ScoreRow({
  name,
  runs,
  won,
  final,
  isKeys = false,
  side,
}: {
  name: string;
  runs: number | null;
  won: boolean;
  final: boolean;
  /** The Keys' own row reads in orange — the home identity — vs cream for the opponent. */
  isKeys?: boolean;
  side: "Home" | "Away";
}) {
  const lost = final && !won;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="flex min-w-0 items-baseline gap-1.5 text-[14px]"
        style={{
          color: isKeys ? KEYS_ORANGE_DEEP : INK,
          fontWeight: won || isKeys ? 700 : 500,
          opacity: lost ? 0.58 : 1,
        }}
      >
        <span className="min-w-0 truncate">{name}</span>
        <span
          className="shrink-0 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "rgba(26,21,14,0.58)" }}
        >
          {side}
        </span>
      </span>
      <span
        className="shrink-0 font-mono text-[21px] tabular-nums"
        style={{
          color: INK,
          fontWeight: won ? 700 : 500,
          opacity: lost ? 0.58 : 1,
        }}
      >
        {runs ?? "–"}
      </span>
    </div>
  );
}

export default function KeysScore() {
  const [score, setScore] = useState<Score | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/sports/keys", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { game: Score | null };
        if (!alive) return; // unmounted during the fetch — don't set state OR reschedule
        setScore(data.game);
        if (data.game && !tracked.current) {
          tracked.current = true;
          track("keys_score_view", { state: data.game.state });
        }
        // Keep polling only while the game is live (and still mounted).
        if (data.game?.state === "live") {
          timer.current = setTimeout(load, POLL_MS);
        }
      } catch {
        /* network hiccup — leave the last state, try again next mount */
      }
    }
    load();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!score) return null;

  const chip = statusChip(score);
  const keysWon = score.state === "final" && (score.keys.runs ?? 0) > (score.opponent.runs ?? 0);
  const oppWon = score.state === "final" && (score.opponent.runs ?? 0) > (score.keys.runs ?? 0);
  const matchupWord = score.keysHome ? "vs." : "at";
  const action = keysScoreAction(score);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] p-3.5 transition active:scale-[0.99]"
        style={{
          background: `linear-gradient(152deg, ${PLATE} 0%, ${PLATE_DEEP} 100%)`,
          color: INK,
          boxShadow: "var(--app-elev-1), inset 0 0 0 1px rgba(223,70,1,0.22)",
        }}
      >
        {/* Orange pennant rule along the top edge — the team-color signature. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${KEYS_ORANGE} 0%, ${KEYS_ORANGE_DEEP} 100%)` }}
        />
        {/* Oversized baseball watermark, letterpressed off the top-right corner. */}
        <span aria-hidden className="pointer-events-none absolute -right-5 -top-4" style={{ color: INK, opacity: 0.09 }}>
          <BaseballGlyph size={112} />
        </span>

        <div className="relative mb-2 flex items-center justify-between gap-2">
          <span
            className="inline-flex min-w-0 items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: KEYS_ORANGE_DEEP }}
          >
            <BaseballGlyph size={13} />
            <span className="truncate">
              Frederick Keys {matchupWord} {score.opponent.name}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              className="inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{
                borderColor: score.keysHome ? KEYS_ORANGE_DEEP : "rgba(26,21,14,0.3)",
                color: score.keysHome ? KEYS_ORANGE_DEEP : INK,
                background: score.keysHome ? "rgba(223,70,1,0.08)" : "rgba(26,21,14,0.06)",
              }}
            >
              {score.keysHome ? "Home · Nymeo" : "Away"}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={
                chip.live
                  ? { background: KEYS_ORANGE_DEEP, color: "#FFFDF8" }
                  : { background: "rgba(26,21,14,0.15)", color: "rgba(26,21,14,0.75)" }
              }
            >
              {chip.live && (
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse"
                />
              )}
              {chip.text}
            </span>
          </span>
        </div>

        <div className="relative space-y-1">
          <ScoreRow
            name={score.keys.name}
            runs={score.keys.runs}
            won={keysWon}
            final={score.state === "final"}
            isKeys
            side={score.keysHome ? "Home" : "Away"}
          />
          <ScoreRow
            name={score.opponent.name}
            runs={score.opponent.runs}
            won={oppWon}
            final={score.state === "final"}
            side={score.keysHome ? "Away" : "Home"}
          />
        </div>

        <p className="relative mt-2 text-[11.5px]" style={{ color: "rgba(26,21,14,0.72)" }}>
          {detailLine(score)}
          {score.state === "pre" && (
            <LiveCountdown
              targetIso={score.startsAt}
              prefix=" · in"
              className="font-semibold"
              style={{ color: KEYS_ORANGE_DEEP }}
            />
          )}
        </p>

        {/* Only a home pre-game can sell Frederick tickets. Away and completed
            games keep a clear route to the official Keys schedule instead. */}
        <a
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            action.isTickets
              ? `Tickets for the Frederick Keys home game against ${score.opponent.name}`
              : `Official Frederick Keys schedule for the ${score.keysHome ? "home" : "away"} game against ${score.opponent.name}`
          }
          className="tap-44-y relative z-20 mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ borderColor: KEYS_ORANGE_DEEP, color: KEYS_ORANGE_DEEP }}
        >
          {action.label}
        </a>

        {/* The card's primary action — the official schedule/box score. A
            stretched link so the whole plate stays tappable without nesting
            an anchor inside an anchor. */}
        <a
          href={score.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Frederick Keys ${score.keysHome ? "home versus" : "away at"} ${score.opponent.name}, ${chip.text}`}
          className="absolute inset-0 z-10"
        />
      </div>

      <Link
        href="/sports"
        className="tap-44-y group mt-1.5 flex items-center justify-end gap-1 text-[12px] font-semibold"
        style={{ color: "var(--app-brand-press)" }}
      >
        More Frederick sports
        <ChevronRight
          aria-hidden
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
        />
      </Link>
    </div>
  );
}

/** A stitched baseball, drawn in the current text color so it takes the gold
 *  eyebrow / cream watermark tint from its parent. */
function BaseballGlyph({ size = 13, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden style={style}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.4 4.2c1.6 1 2.6 2.4 2.6 3.8s-1 2.8-2.6 3.8M12.6 4.2c-1.6 1-2.6 2.4-2.6 3.8s1 2.8 2.6 3.8"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
