"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Footprints, ArrowRight } from "lucide-react";
import type { MoveStep } from "@/lib/moveStack";

/**
 * PlanDeck — the P4 "plan deck" (frederickradius-handoff pattern P4).
 *
 * The day's suggested itinerary as a horizontal snap deck instead of a
 * vertical text list: each stop is a full card (step label, place name
 * in display type, the role verb, and the walk time to the next stop as
 * the connective element), capped by a summary card. Progress dots
 * track the scroll. Server work (NWS + buildMoveStack) stays in the
 * parent MoveStack; this client leaf owns only the scroll-snap UI, so
 * the heavy data path never ships to the client.
 *
 * Reference: docs/reference/pattern-lab.html, P4 demo — 82%-wide cards,
 * scroll-snap-align center, one dot per stop PLUS the summary card,
 * active dot via round(scrollLeft / (scrollWidth / dotCount)).
 */
export default function PlanDeck({
  title,
  intro,
  steps,
}: {
  title: string;
  intro: string;
  steps: MoveStep[];
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // One dot per stop card plus the terminal summary card.
  const dotCount = steps.length + 1;
  const totalWalk = steps.reduce((sum, s) => sum + (s.walkMin ?? 0), 0);

  function onScroll() {
    const rail = railRef.current;
    if (!rail) return;
    const i = Math.round(rail.scrollLeft / (rail.scrollWidth / dotCount));
    setActive(Math.min(i, dotCount - 1));
  }

  return (
    <section aria-label={title}>
      <header className="mb-2.5 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2
            className="font-serif text-[18px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {title}
          </h2>
          <p className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
            {intro}
          </p>
        </div>
        <Link
          href="/plan"
          className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--app-brand)" }}
        >
          Build your own
        </Link>
      </header>

      <div
        ref={railRef}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <article
              key={s.n}
              className="deck-card flex w-[82%] shrink-0 snap-center flex-col rounded-[var(--app-radius-lg)] p-4 sm:w-[340px]"
              style={{ background: "var(--app-bg-elevated)" }}
            >
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {s.verb}
              </p>
              {s.slug ? (
                <Link
                  href={`/places/${s.slug}`}
                  className="mt-1 font-serif text-[22px] font-semibold leading-tight tracking-tight underline-offset-2 hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  {s.name}
                </Link>
              ) : (
                <span
                  className="mt-1 font-serif text-[22px] font-semibold leading-tight tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {s.name}
                </span>
              )}
              {/* Walk time to the next stop — the connective element. The
                  last stop closes the sequence instead. */}
              <p
                className="mt-auto flex items-center gap-1.5 pt-4 text-[12px] tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {last ? (
                  <>You&rsquo;re set for the evening.</>
                ) : typeof s.walkMin === "number" ? (
                  <>
                    <Footprints className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {s.walkMin}m walk
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    next stop
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    next stop
                  </>
                )}
              </p>
            </article>
          );
        })}

        {/* Terminal summary card — inverted, closes the deck. */}
        <article
          className="flex w-[82%] shrink-0 snap-center flex-col justify-center rounded-[var(--app-radius-lg)] p-4 sm:w-[340px]"
          style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-70">
            Your evening
          </p>
          <p className="mt-1 font-serif text-[22px] font-semibold leading-tight tracking-tight">
            {steps.length} stops
            {totalWalk > 0 ? ` · ~${totalWalk} min walking` : ""}
          </p>
          <p className="mt-3 text-[12px] opacity-80">
            A suggested plan from what&rsquo;s downtown — check hours before
            you go.
          </p>
        </article>
      </div>

      {/* Progress dots — one per stop card plus the summary. */}
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-colors"
            style={{
              background: i === active ? "var(--app-brand)" : "var(--app-border)",
            }}
          />
        ))}
      </div>
    </section>
  );
}
