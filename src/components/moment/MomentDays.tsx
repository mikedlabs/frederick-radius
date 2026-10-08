import DatePlate from "@/components/event/DatePlate";
import type { MomentDay } from "@/data/civic-moments";
import { momentDays } from "./momentGuide";

/**
 * MomentDays prints one date plate per day the occasion runs, in calendar
 * order. It shows no counts: the plates answer "which days", and the rest of
 * the hub says what happens on them. The plates are pictures, so each day
 * also carries its full date for assistive technology.
 */
export default function MomentDays({ days }: { days: readonly MomentDay[] | undefined }) {
  const parts = momentDays(days);
  if (parts.length === 0) return null;
  return (
    <ul aria-label="Days" className="flex flex-wrap gap-3" data-moment-days>
      {parts.map((day) => (
        <li key={day.date} data-moment-day={day.date}>
          <DatePlate
            month={day.month}
            day={day.day}
            weekday={day.weekday}
            accent="var(--app-brand)"
            size="md"
          />
          <span className="sr-only">{day.label}</span>
        </li>
      ))}
    </ul>
  );
}
