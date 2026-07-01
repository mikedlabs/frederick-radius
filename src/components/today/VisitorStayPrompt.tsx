"use client";

import { useMode } from "@/hooks/useMode";
import StayDeepLinks from "@/components/municipality/StayDeepLinks";

/**
 * VisitorStayPrompt — surfaces the "Where to stay" card on /today
 * only when the active mode is Visitor.
 *
 * Why this exists
 *   Proposal B's "Stay" door — visitors arriving from a marketing
 *   link (or anyone toggled into Visitor mode) get a one-tap path
 *   to lodging options for Frederick without needing to discover
 *   the muni page. Residents see nothing here (they have a home).
 *
 *   The "you're seeing the Visitor view · Switch to Resident" caption
 *   that used to sit under this card was removed: the always-visible
 *   TodayLens picker at the top of /today now owns lens visibility and
 *   switching, so the caption was duplicate chrome.
 *
 * Defaults to Frederick (city) because it's the visitor's most likely
 * entry point. If we later infer the destination town from a deep
 * link, we can pass that through.
 *
 * Renders nothing for residents and during SSR/hydration before the
 * mode resolves — we don't want a flash of "stay" content for someone
 * who lives here.
 */
export default function VisitorStayPrompt() {
  const { mode, mounted } = useMode();
  if (!mounted || mode !== "visitor") return null;
  return <StayDeepLinks townName="Frederick" townSlug="frederick" />;
}
