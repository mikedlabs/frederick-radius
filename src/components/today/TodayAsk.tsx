"use client";

import { useState } from "react";
import { Search, Clock, Calendar, Train, MapPin } from "lucide-react";
import SearchOverlay from "@/components/search/SearchOverlay";
import Pill from "@/components/ui/Pill";
import { QUICK_INTENTS } from "@/lib/answers/intents";
import type { IntentIcon } from "@/lib/answers/types";

/**
 * TodayAsk — the answer-first front door (UX_REDO Build 1).
 *
 * "Ask Radius anything" + suggested intent chips, mounted at the top
 * of /today. Tapping the field opens the existing SearchOverlay (live
 * search, reused as-is); the chips route to their intent answers. The
 * 3 to 5 default AnswerCards rendered below this on /today carry the
 * anticipatory layer for the undecided user.
 */

const ICON: Record<IntentIcon, typeof Clock> = {
  clock: Clock,
  calendar: Calendar,
  train: Train,
  pin: MapPin,
};

export default function TodayAsk() {
  const [open, setOpen] = useState(false);
  // The five strongest needs as hero chips (skip the generic "events").
  const chips = QUICK_INTENTS.filter((i) => i.key !== "events").slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Ask Radius
        </p>
        <h1
          className="text-[26px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)", fontFamily: "var(--font-display, Georgia, serif)" }}
        >
          Ask Radius anything.
        </h1>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search Frederick Radius"
        className="tactile tactile-interactive flex w-full items-center gap-3 rounded-[var(--app-radius-lg)] border px-4 py-3.5 text-left"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <Search className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <span className="text-[14px]" style={{ color: "var(--app-ink-3)" }}>
          Open now · live music tonight · parking · coffee in Brunswick
        </span>
      </button>

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

      <SearchOverlay open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
