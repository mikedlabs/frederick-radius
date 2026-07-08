import type { EventWithMeta } from "@/lib/loaders/events";
import type { ReasonTone } from "@/components/ui/ReasonChip";
import { daypart } from "@/lib/daypart";
import { isEventLiveNow } from "@/lib/eventWhenLabel";

/**
 * Derive the small "why this is shown" chips for an event, from data
 * the loader already produces. No new ingestion required.
 *
 * Capped at 3 per card so the row stays scannable. Priority order
 * (earlier reasons survive the cap):
 *
 *   1. Live now / starting soon / tonight — time relevance
 *   2. Free — no admission cost
 *   3. Distance — walkable from the user / town
 *   4. Outdoor / family-friendly (from category) — context
 */
export type EventReason =
  | "live_now"
  | "starting_soon"
  | "tonight"
  | "weekend"
  | "free"
  | "near"
  | "walkable"
  | "outdoor"
  | "family";

export type EventReasonChip = { kind: EventReason; label: string; tone: ReasonTone };

const STARTING_SOON_MIN = 90; // events starting within 90m
const TONIGHT_HOURS = 6; // next 6 hours = "tonight" lens

const WALK_NEAR_M = 400;
const WALK_OK_M = 1200;
const WALK_SPEED_M_PER_MIN = 80;

const OUTDOOR_CATS = new Set([
  "outdoors", "park", "trail", "festival", "market", "food-truck",
]);
const FAMILY_CATS = new Set(["family", "kids"]);

export function eventReasons(
  e: EventWithMeta,
  now: Date = new Date(),
): EventReasonChip[] {
  const out: EventReasonChip[] = [];
  const startsMs = Date.parse(e.starts_at);
  const nowMs = now.getTime();

  // 1. Time relevance — strongest first. Liveness goes through the shared
  // gate (all-day and end-of-day/range end stamps must not read "Live now"
  // at 11 PM — beta-reviewer catch, Jul 2026).
  if (isEventLiveNow(e, now)) {
    out.push({ kind: "live_now", label: "Live now", tone: "open" });
  } else if (startsMs > nowMs) {
    const minsAway = (startsMs - nowMs) / 60_000;
    if (minsAway <= STARTING_SOON_MIN) {
      out.push({ kind: "starting_soon", label: "Starting soon", tone: "open" });
    } else if (minsAway <= TONIGHT_HOURS * 60) {
      // "Tonight" only when the event actually STARTS in the evening/late
      // band (the shared daypart bands eventWhenLabel's callers key off) —
      // a 10 AM start three hours out is "Today", not "Tonight".
      const startBand = daypart(new Date(startsMs));
      const isEveningStart = startBand === "evening" || startBand === "late";
      out.push({ kind: "tonight", label: isEveningStart ? "Tonight" : "Today", tone: "open" });
    } else {
      // Weekend window: Friday 5 PM ET through Monday 00:00 ET (local).
      // Compute here rather than threading from the server so a card
      // can decide independently.
      const startsDate = new Date(startsMs);
      const dow = startsDate.getDay();
      const isWeekend = dow === 5 || dow === 6 || dow === 0;
      const within7Days = startsMs - nowMs <= 7 * 24 * 3600_000;
      if (isWeekend && within7Days) {
        out.push({ kind: "weekend", label: "Weekend", tone: "open" });
      }
    }
  }

  // 2. Free — strong intent signal.
  if (e.is_free) {
    out.push({ kind: "free", label: "Free", tone: "free" });
  }

  // 3. Distance — only when origin set.
  if (typeof e.distance_m === "number") {
    if (e.distance_m <= WALK_NEAR_M) {
      const mins = Math.max(1, Math.round(e.distance_m / WALK_SPEED_M_PER_MIN));
      out.push({ kind: "near", label: `${mins} min walk`, tone: "near" });
    } else if (e.distance_m <= WALK_OK_M) {
      out.push({ kind: "walkable", label: "Walkable", tone: "near" });
    }
  }

  // 4. Context — outdoor / family. From category, lossy but useful.
  if (OUTDOOR_CATS.has(e.category)) {
    out.push({ kind: "outdoor", label: "Outdoor", tone: "neutral" });
  }
  if (FAMILY_CATS.has(e.category)) {
    out.push({ kind: "family", label: "Family", tone: "neutral" });
  }

  return out.slice(0, 3);
}
