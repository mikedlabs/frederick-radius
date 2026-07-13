import { Suspense, type ReactNode } from "react";
import { holidayOn } from "@/lib/holidays";
import { pickSeasonalNote } from "@/lib/seasonal-notes";
import HolidayNote from "./HolidayNote";
import SeasonalBeat from "./SeasonalBeat";
import CommunityNotes from "./CommunityNotes";
import FcpsBeat from "./FcpsBeat";
import CreekWatch from "./CreekWatch";

/**
 * MastheadNotes — the calm cap on the /today masthead almanac stack.
 *
 * The masthead accreted several self-hiding one-liners. This is the single
 * source of truth for that region. It renders, in order:
 *   1. ONE server-decidable dated note, by priority: Holiday (a civic closure
 *      has real consequence) > the seasonal almanac note (First Saturday /
 *      market / leaf season). Exactly one of those.
 *   2. The governed community layer (CommunityNotes): at most one even-handed
 *      community note (Pride in June, Sunday places of worship), which the user
 *      can turn off entirely with one topic-neutral switch.
 *   3. The streamed weather "duck inside" beat (adverse weather is not an
 *      ordinary day, so it may ride alongside).
 *   4. The always-on town picker.
 *
 * The dated predicates MIRROR each leaf's own self-hide guard (holidayOn,
 * pickSeasonalNote), so the cap can only ever SUPPRESS a second dated note,
 * never force a hidden one to show. weatherSlot and contextSlot are passed in
 * PRE-SUSPENDED: this component never awaits NWS or the events feed (the plate
 * paints first). CommunityNotes is a client component that self-governs.
 */
export default function MastheadNotes({
  now,
  weatherSlot,
  contextSlot,
}: {
  now: Date;
  /** Optional since 2026-07-02: the "Weather to duck." nudge was retired
   *  (Plan the moment carries the Rainy-day action now). */
  weatherSlot?: ReactNode;
  /** Optional since 2026-07-13: the town picker moved UP into MastheadTitle
   *  (the "{town}, today." line IS the picker now), so the masthead no longer
   *  needs a separate location slot at the foot of the notes stack. */
  contextSlot?: ReactNode;
}) {
  const hasHoliday = Boolean(holidayOn(now));
  const seasonal = pickSeasonalNote(now);

  // Exactly one dated note: a holiday outranks the seasonal almanac line.
  const dated: "holiday" | "seasonal" | null = hasHoliday ? "holiday" : seasonal ? "seasonal" : null;

  return (
    <div className="mt-2 space-y-1.5">
      {dated === "holiday" && <HolidayNote now={now} />}
      {dated === "seasonal" && <SeasonalBeat now={now} />}
      {/* School + creek alerts: rare, important, self-hiding. Async, so each is
          streamed in its own Suspense and never awaited by the masthead. */}
      <Suspense fallback={null}>
        <FcpsBeat now={now} />
      </Suspense>
      <Suspense fallback={null}>
        <CreekWatch />
      </Suspense>
      <CommunityNotes />
      {weatherSlot}
      {contextSlot}
    </div>
  );
}
