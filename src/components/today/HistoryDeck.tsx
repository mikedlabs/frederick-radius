"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Landmark, MapPin, RotateCw } from "lucide-react";
import type { HistoryEntry } from "@/data/history";
import { eraForYear } from "@/lib/history-era";

/**
 * HistoryDeck: the interactive "Did you know?" card on Today.
 *
 * The old card dropped a three-line history paragraph onto the page
 * statically. This one leads with the hook and hides the rest:
 *
 *   Collapsed   a big era-colored year (or a landmark glyph for an
 *               evergreen fact) plus the one-line title. Nothing else.
 *   Revealed    tap the card and the story expands underneath, with
 *               the place and a link into the full /history section.
 *
 * Two interactions make it a deck, not a poster: tap to reveal or
 * hide the story, and tap "another" to step to the next of all the
 * fact + moment entries. The accent (and the corner bloom) follows
 * the year's historical era, so the card changes hue as you move.
 *
 * Client component: it owns the `idx` + `revealed` state. The reveal
 * is a CSS-only height animation (the grid 0fr/1fr trick), so there
 * is no measuring JavaScript and no layout thrash.
 */

/** Evergreen facts carry no year, so they have no era. They take the
 *  steady civic blue Today already uses for the history accent. */
const FACT_ACCENT = "#2A5D8F";

export default function HistoryDeck({
  facts,
  start,
}: {
  /** Fact + moment entries, filtered and ordered by HistoryPulse. */
  facts: HistoryEntry[];
  /** Server-picked starting index. Rotates once per calendar day. */
  start: number;
}) {
  const [idx, setIdx] = useState(() =>
    facts.length ? ((start % facts.length) + facts.length) % facts.length : 0,
  );
  const [revealed, setRevealed] = useState(false);

  if (facts.length === 0) return null;

  const fact = facts[idx];
  const era = fact.year ? eraForYear(fact.year) : null;
  const accent = era?.color ?? FACT_ACCENT;
  const kindLabel = era ? era.label : "Frederick fact";

  function another() {
    setIdx((i) => (i + 1) % facts.length);
    setRevealed(false);
  }

  return (
    <div
      className="tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-5"
      style={{ "--section-accent": accent } as React.CSSProperties}
    >
      {/* Corner bloom in the entry's era color. It transitions on
          "another" so the whole card warms or cools as time moves. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{
          background: `radial-gradient(85% 100% at 100% 0%, color-mix(in srgb, ${accent} 17%, transparent), transparent 60%)`,
        }}
      />

      <div className="relative">
        {/* Header: era / kind on the left, deck position + the
            "another" control on the right. The section heading above
            the card already says "Did you know", so it is not
            repeated here. */}
        <div className="flex items-center justify-between gap-3">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: `color-mix(in srgb, ${accent} 16%, transparent)`,
              color: accent,
            }}
          >
            {kindLabel}
          </span>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {idx + 1} / {facts.length}
            </span>
            <button
              type="button"
              onClick={another}
              aria-label="Show another Frederick fact"
              className="grid h-9 w-9 place-items-center rounded-full border outline-none transition active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]"
              style={{ borderColor: "var(--app-border)", color: accent }}
            >
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>

        {/* The hook is one big tap target that toggles the story.
            It holds only phrasing content (spans + svg) so it stays
            a valid <button>. */}
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-expanded={revealed}
          className="mt-3 block w-full rounded-[var(--app-radius-sm)] text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]"
        >
          <span className="flex items-end gap-2.5">
            {fact.year ? (
              <span
                className="font-serif text-[44px] font-bold leading-[0.85] tabular-nums"
                style={{ color: accent }}
              >
                {fact.year}
              </span>
            ) : (
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
                style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
              >
                <Landmark
                  className="h-6 w-6"
                  strokeWidth={2}
                  style={{ color: accent }}
                  aria-hidden
                />
              </span>
            )}
            {fact.date_label && (
              <span
                className="pb-1 text-[11px] font-medium"
                style={{ color: "var(--app-ink-3)" }}
              >
                {fact.date_label}
              </span>
            )}
          </span>
          <span className="mt-2 flex items-start justify-between gap-2">
            <span
              className="font-serif text-[20px] font-semibold leading-snug tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {fact.title}
            </span>
            <ChevronDown
              className="mt-1 h-4 w-4 shrink-0 transition-transform duration-300"
              strokeWidth={2.5}
              aria-hidden
              style={{ color: accent, transform: revealed ? "rotate(180deg)" : "none" }}
            />
          </span>
          {!revealed && (
            <span
              className="mt-2 inline-flex text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: accent }}
            >
              Reveal the story
            </span>
          )}
        </button>

        {/* The story. The grid row animates 0fr to 1fr for a smooth
            height reveal; `inert` keeps the contents out of the tab
            order and away from screen readers while collapsed. */}
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: revealed ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden" inert={!revealed}>
            <div
              className="mt-3 border-t pt-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p
                className="text-[13.5px] leading-relaxed text-pretty"
                style={{ color: "var(--app-ink-2)" }}
              >
                {fact.body}
              </p>
              {fact.place && (
                <p
                  className="mt-2 inline-flex items-center gap-1 text-[11px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
                  {fact.place}
                </p>
              )}
              <p className="mt-3">
                <Link
                  href="/history"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: accent }}
                >
                  More Frederick history
                  <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
