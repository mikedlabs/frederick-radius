"use client";

import AskFrederick from "@/components/ask/AskFrederick";

/**
 * TodayAsk — the answer-first front door (UX_REDO Build 1).
 *
 * "Ask Radius anything" mounted at the top of /today, backed by the real
 * grounded concierge (AskFrederick → /api/ask). The box's own "Ask Radius"
 * eyebrow is hidden here because this headline already labels it (no double
 * "Ask Radius"). The quick-intent chips were removed: they duplicated the
 * anticipatory answer cards rendered directly below on /today, so the page
 * said the same thing twice and pushed the first real answer below the fold.
 */
export default function TodayAsk() {
  return (
    <div className="space-y-3">
      <h1
        className="text-[26px] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--app-ink)", fontFamily: "var(--font-display, Georgia, serif)" }}
      >
        Ask Radius anything.
      </h1>
      <AskFrederick hideLabel />
    </div>
  );
}
