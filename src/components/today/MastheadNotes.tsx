import { Suspense } from "react";
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
 *   3. Rare school and creek alerts, streamed independently.
 *
 * The dated predicates MIRROR each leaf's own self-hide guard (holidayOn,
 * pickSeasonalNote), so the cap can only ever SUPPRESS a second dated note,
 * never force a hidden one to show. This component never awaits NWS or the
 * events feed, so the plate paints first. CommunityNotes is a client component
 * that self-governs.
 */
export default function MastheadNotes({ now }: { now: Date }) {
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
    </div>
  );
}
