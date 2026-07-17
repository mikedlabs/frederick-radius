import AskFrederick from "@/components/ask/AskFrederick";
import type { ReactNode } from "react";

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
export default function TodayAsk({ action }: { action?: ReactNode }) {
  return (
    <section id="ask-radius" aria-labelledby="today-ask-head" className="scroll-mt-24">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <h2 id="today-ask-head" className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Ask Radius
        </h2>
        {action}
      </div>
      <AskFrederick hideLabel quickAsks={[]} placeholder="Ask about a place, plan, or event…" />
    </section>
  );
}
