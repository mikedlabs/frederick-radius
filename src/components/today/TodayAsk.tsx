"use client";

import { Clock, Calendar, Train, MapPin } from "lucide-react";
import Pill from "@/components/ui/Pill";
import AskFrederick from "@/components/ask/AskFrederick";
import { QUICK_INTENTS } from "@/lib/answers/intents";
import type { IntentIcon } from "@/lib/answers/types";

/**
 * TodayAsk — the answer-first front door (UX_REDO Build 1).
 *
 * "Ask Radius anything" mounted at the top of /today, now backed by the
 * real grounded concierge (AskFrederick → /api/ask): a natural-language
 * question returns an AI answer with clickable, verifiable source cards.
 * It degrades gracefully — with no AI key the API still keyword-matches
 * real places, so the box returns place cards rather than a dead end, and
 * plain typeahead stays one tap away via the header search pill. The
 * suggested intent chips route to their intent answers.
 */

const ICON: Record<IntentIcon, typeof Clock> = {
  clock: Clock,
  calendar: Calendar,
  train: Train,
  pin: MapPin,
};

export default function TodayAsk({
  onSky = false,
}: {
  /** Mounted on the SkyHero canvas: the headline inherits the hero's
   *  mood-adjusted text color (SkyHero owns the contrast guarantee).
   *  The ask box and chips are self-surfaced cards, legible on any
   *  sky. */
  onSky?: boolean;
}) {
  // The five strongest needs as hero chips (skip the generic "events").
  const chips = QUICK_INTENTS.filter((i) => i.key !== "events").slice(0, 5);

  return (
    <div className="space-y-3">
      <h1
        className="text-[26px] font-semibold leading-tight tracking-tight"
        style={{
          color: onSky ? "inherit" : "var(--app-ink)",
          fontFamily: "var(--font-display, Georgia, serif)",
        }}
      >
        Ask Radius anything.
      </h1>

      {/* The grounded concierge box — real answers from real records. */}
      <AskFrederick />

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const I = ICON[c.icon];
          return (
            <Pill key={c.key} href={c.href} tone="prominent" size="sm" icon={<I className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}>
              {c.chip}
            </Pill>
          );
        })}
      </div>
    </div>
  );
}
