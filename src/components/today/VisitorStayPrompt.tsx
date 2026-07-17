import StayDeepLinks from "@/components/municipality/StayDeepLinks";

/**
 * VisitorStayPrompt — the "Where to stay" door on /today.
 *
 * Formerly gated to Visitor mode. When the Resident/Visitor toggle was
 * collapsed (2026-07-01, owner call), the gate came out: the card is now
 * a standing part of /today for everyone. A local sending an out-of-town
 * guest the link wants the lodging shortcut just as much as a first-time
 * visitor does, so hiding it for residents cost more than it saved.
 *
 * Defaults to Frederick (city) as the most likely entry point. If we later
 * infer the destination town from a deep link, we can pass that through.
 *
 * Now a plain server component (no mode read, no mounted gate), so it
 * renders on first paint and is fully crawlable.
 */
export default function VisitorStayPrompt() {
  return <StayDeepLinks townName="Frederick" townSlug="frederick" compact />;
}
