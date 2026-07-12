"use client";

import AskFrederick from "@/components/ask/AskFrederick";

/**
 * TodayAsk — the ask box on /today (UX-01 phase 1).
 *
 * The grounded concierge (AskFrederick → /api/ask) was fully built but
 * orphaned — zero importers — so the product's core promise never
 * appeared on the front door (July 2026 review's killer finding). It
 * mounts under the sky hero: an h2 section head in the house serif, not
 * the h1 it was first drafted as (the page already carries its h1). The
 * box's own "Ask Radius" eyebrow stays hidden because this heading
 * already labels it.
 */
export default function TodayAsk() {
  return (
    <section aria-labelledby="today-ask-head" className="mt-4 space-y-2.5">
      <h2
        id="today-ask-head"
        className="font-serif text-[18px] font-semibold leading-none tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        Ask Radius anything.
      </h2>
      <AskFrederick hideLabel />
    </section>
  );
}
