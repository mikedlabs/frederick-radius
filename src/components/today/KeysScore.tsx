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
 * Voice + palette discipline: scores in the mono data voice, calm cream card,
 * and vermilion reserved for the single live signal (the "LIVE" dot). A final
 * game keeps showing through the rest of the day so fans who missed it get the
 * result; a pre-game shows only the first-pitch time.
 */
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/track";
import type { KeysScore as Score } from "@/lib/integrations/keysScore";

const POLL_MS = 45_000;

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
  if (s.state === "live") {
    const inning = [s.inningState, s.inningOrdinal].filter(Boolean).join(" ");
    const outs = s.outs != null ? `${s.outs} out` : "";
    return [inning, outs].filter(Boolean).join(" · ");
  }
  if (s.state === "pre") {
    const t = firstPitch(s.startsAt);
    return t ? `First pitch ${t}` : "Today";
  }
  if (s.state === "postponed") return "The game was postponed, so check the official page.";
  if (s.state === "cancelled") return "The game was called off.";
  // final
  return s.keysHome ? "at Nymeo Field, Frederick" : `at ${s.opponent.name}`;
}

function ScoreRow({
  name,
  runs,
  won,
  final,
}: {
  name: string;
  runs: number | null;
  won: boolean;
  final: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="min-w-0 truncate text-[14px]"
        style={{
          color: "var(--app-ink)",
          fontWeight: final && won ? 700 : 500,
          opacity: final && !won ? 0.6 : 1,
        }}
      >
        {name}
      </span>
      <span
        className="shrink-0 font-mono text-[20px] tabular-nums"
        style={{
          color: "var(--app-ink)",
          fontWeight: won ? 700 : 500,
          opacity: final && !won ? 0.6 : 1,
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
  const vs = score.keysHome ? "vs" : "@";

  return (
    <a
      href={score.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-[var(--app-radius-lg)] border p-3.5 shadow-[var(--app-shadow-1)] transition active:scale-[0.99]"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      aria-label={`Frederick Keys ${vs} ${score.opponent.name}, ${chip.text}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <BaseballGlyph />
          Frederick Keys {vs} {score.opponent.name}
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={
            chip.live
              ? // brand-press, not raw brand: white 10px text on #E14328
                // sits under WCAG AA (≈3.9:1) — the press variant is the
                // AA-safe vermilion for exactly this white-on-fill case.
                // Only renders DURING a live game, which is why the gate
                // only catches it on game nights.
                { background: "var(--app-brand-press)", color: "#fff" }
              : { background: "var(--app-ink-tint-6)", color: "var(--app-ink-2)" }
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
      </div>

      <div className="space-y-1">
        <ScoreRow name={score.keys.name} runs={score.keys.runs} won={keysWon} final={score.state === "final"} />
        <ScoreRow name={score.opponent.name} runs={score.opponent.runs} won={oppWon} final={score.state === "final"} />
      </div>

      <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
        {detailLine(score)}
      </p>
    </a>
  );
}

function BaseballGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden style={{ color: "var(--app-brand)" }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.4 4.2c1.6 1 2.6 2.4 2.6 3.8s-1 2.8-2.6 3.8M12.6 4.2c-1.6 1-2.6 2.4-2.6 3.8s1 2.8 2.6 3.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
