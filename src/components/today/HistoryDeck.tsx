"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Landmark, MapPin } from "lucide-react";
import type { HistoryEntry } from "@/data/history";
import { eraForYear } from "@/lib/history-era";

/**
 * HistoryDeck: the interactive "Did you know?" card on Today.
 *
 * Leads with the hook and hides the rest:
 *
 *   Collapsed   a photo (when the entry has one) plus a big era-colored
 *               year (or a landmark glyph for an evergreen fact) and
 *               the one-line title. Nothing else.
 *   Revealed    tap the card and the story expands underneath, with
 *               the place and a link into the full /history section.
 *
 * Interactions:
 *   - tap the hook to reveal or hide the story
 *   - the prev / next arrows, or a left / right swipe, step through
 *     every fact + moment entry
 *
 * The accent and corner bloom follow the year's historical era, so the
 * card changes hue as you move through time. Entries with a photo get
 * a full-bleed banner; entries without one keep the era-gradient
 * treatment, so the card never looks empty.
 *
 * Client component: it owns `idx` + `revealed` state. The reveal is a
 * CSS-only height animation (the grid 0fr/1fr trick), no measuring JS.
 */

/** Evergreen facts carry no year, so they have no era. They take the
 *  steady civic blue Today already uses for the history accent. */
const FACT_ACCENT = "#2F5470";

/** A swipe must travel this far horizontally, and be clearly more
 *  horizontal than vertical, before it steps the deck. Keeps a
 *  vertical page scroll from registering as a swipe. */
const SWIPE_PX = 48;

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
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (facts.length === 0) return null;

  const fact = facts[idx];
  const era = fact.year ? eraForYear(fact.year) : null;
  const accent = era?.color ?? FACT_ACCENT;
  const kindLabel = era ? era.label : "Frederick fact";

  /** Step the deck by `delta` (wraps both ways) and re-collapse. */
  function go(delta: number) {
    setIdx((i) => (i + delta + facts.length) % facts.length);
    setRevealed(false);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const from = touch.current;
    touch.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    // Horizontal-dominant drag past the threshold steps the deck;
    // anything else is left to the page (vertical scroll, a tap).
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
    }
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-5"
      style={{ "--section-accent": accent } as React.CSSProperties}
    >
      {/* Corner bloom in the entry's era color. It transitions as you
          step, so the whole card warms or cools as time moves. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{
          background: `radial-gradient(85% 100% at 100% 0%, color-mix(in srgb, ${accent} 17%, transparent), transparent 60%)`,
        }}
      />

      <div className="relative">
        {/* Photo banner: a full-bleed strip across the card top. Only
            entries with a curated image get one; the rest lean on the
            era gradient below, so the card never looks empty. */}
        {fact.image && (
          <div className="relative -mx-5 -mt-5 mb-4 h-40 overflow-hidden">
            {/* WebP source first, JPEG fallback. The .webp siblings are
                emitted by `npm run optimize:images`. Modern browsers
                pick the smaller .webp (~30% smaller on this set); older
                ones fall back to the JPEG without a flash. */}
            <picture>
              <source
                srcSet={fact.image.src.replace(/\.jpe?g$/i, ".webp")}
                type="image/webp"
              />
              <img
                src={fact.image.src}
                alt={fact.image.alt ?? ""}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </picture>
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/3"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}
            />
            {fact.image.credit && (
              <span className="absolute bottom-1 right-2 text-[9px] font-medium text-white/70">
                {fact.image.credit}
              </span>
            )}
          </div>
        )}

        {/* Header: era / kind on the left; the deck pager (prev,
            position, next) on the right. The section heading above the
            card already says "Did you know", so it is not repeated. */}
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous fact"
              className="grid h-9 w-9 place-items-center rounded-full border outline-none transition active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]"
              style={{ borderColor: "var(--app-border)", color: accent }}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
            <span
              className="min-w-[3rem] text-center text-[10px] font-semibold tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {idx + 1} / {facts.length}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next fact"
              className="grid h-9 w-9 place-items-center rounded-full border outline-none transition active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]"
              style={{ borderColor: "var(--app-border)", color: accent }}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>

        {/* The hook is one big tap target that toggles the story. It
            holds only phrasing content (spans + svg) so it stays a
            valid <button>. */}
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
