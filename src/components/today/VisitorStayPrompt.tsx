"use client";

import Link from "next/link";
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
 *   Also serves as the lens's visibility check — a small caption
 *   under the card tells the user they're seeing the Visitor view
 *   and links to Settings where they can flip to Resident. Without
 *   this, the lens is invisible and "I live here" users don't know
 *   to switch.
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
  return (
    <div className="space-y-2">
      <StayDeepLinks townName="Frederick" townSlug="frederick" />
      <p
        className="px-1 text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        You&rsquo;re seeing the Visitor view.{" "}
        <Link
          href="/settings"
          className="font-semibold underline decoration-dotted underline-offset-2"
          style={{ color: "var(--app-ink-2)" }}
        >
          Switch to Resident
        </Link>{" "}
        if you live here.
      </p>
    </div>
  );
}
