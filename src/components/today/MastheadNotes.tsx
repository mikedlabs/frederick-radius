import type { ReactNode } from "react";
import { holidayOn } from "@/lib/holidays";
import { COLLECTION_BY_SLUG } from "@/data/collections";
import { pickSeasonalNote } from "@/lib/seasonal-notes";
import HolidayNote from "./HolidayNote";
import PrideBeat from "./PrideBeat";
import SeasonalBeat from "./SeasonalBeat";

/**
 * MastheadNotes — the calm cap on the /today masthead almanac stack.
 *
 * The masthead accreted several self-hiding one-liners (holiday, Pride, the new
 * seasonal + weather beats, plus the always-on town picker). Left loose they
 * could pile up four or five deep on a busy day. This is the single source of
 * truth for that region: it shows AT MOST ONE server-decidable dated note, by an
 * explicit priority ladder, plus the streamed weather slot and the always-on
 * town-picker slot.
 *
 * Priority (highest first): Holiday (a civic closure has real consequence) ->
 * Seasonal "First Saturday" (a dated, same-day rhythm) -> Pride (a June
 * evergreen) -> Seasonal broad (market season / leaf season). Exactly one of
 * those renders. The weather "duck inside" beat is genuinely actionable and
 * adverse-weather is not an ordinary day, so it is allowed to ride alongside the
 * dated note (worst case: one dated note + weather + town picker = 3 lines, only
 * when the weather is actually bad).
 *
 * The predicates here MIRROR each leaf's own self-hide guard exactly (holidayOn,
 * the June + lgbtq-frederick check, pickSeasonalNote), so the cap can only ever
 * SUPPRESS a second dated note, never force a hidden one to show; each leaf
 * keeps its own guard as belt-and-braces. weatherSlot and contextSlot are passed
 * in PRE-SUSPENDED: this component never awaits NWS (that would make the masthead
 * server-await the forecast), it treats them as opaque streamed nodes.
 */
export default function MastheadNotes({
  now,
  weatherSlot,
  contextSlot,
}: {
  now: Date;
  weatherSlot: ReactNode;
  contextSlot: ReactNode;
}) {
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(now),
  );
  const hasHoliday = Boolean(holidayOn(now));
  const hasPride = month === 6 && Boolean(COLLECTION_BY_SLUG["lgbtq-frederick"]);
  const seasonal = pickSeasonalNote(now);
  const seasonalIsDated = seasonal?.id === "first-saturday";

  // Exactly one dated note, by priority.
  let dated: "holiday" | "seasonal" | "pride" | null = null;
  if (hasHoliday) dated = "holiday";
  else if (seasonalIsDated) dated = "seasonal";
  else if (hasPride) dated = "pride";
  else if (seasonal) dated = "seasonal"; // broad seasonal (market/leaf)

  return (
    <div className="mt-2 space-y-1.5">
      {dated === "holiday" && <HolidayNote now={now} />}
      {dated === "seasonal" && <SeasonalBeat now={now} />}
      {dated === "pride" && <PrideBeat now={now} />}
      {weatherSlot}
      {contextSlot}
    </div>
  );
}
