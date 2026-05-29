import { Zap, MoonStar, Sunrise, CalendarRange } from "lucide-react";
import Pill from "@/components/ui/Pill";

/**
 * TimeToggle — the brand-defining "when?" control at the top of /today.
 * Lets a user pivot the page between Now, Tonight, Tomorrow, and This
 * Weekend in a single tap. Mode lives in the ?t= URL param so the
 * view is shareable.
 *
 * Built on the canonical Pill primitive (ink tone, link variant) so it
 * shares the app's one press feel + pending behavior. Renders inside a
 * server component — Pill is a client component, which is fine here.
 */

export type TodayTimeMode = "now" | "tonight" | "tomorrow" | "weekend";

export function isTodayTimeMode(s: string | undefined): s is TodayTimeMode {
  return s === "now" || s === "tonight" || s === "tomorrow" || s === "weekend";
}

const CHIPS: Array<{
  key: TodayTimeMode;
  label: string;
  Icon: typeof Zap;
}> = [
  { key: "now", label: "Now", Icon: Zap },
  { key: "tonight", label: "Tonight", Icon: MoonStar },
  { key: "tomorrow", label: "Tomorrow", Icon: Sunrise },
  { key: "weekend", label: "Weekend", Icon: CalendarRange },
];

export default function TimeToggle({
  active,
  counts,
}: {
  active: TodayTimeMode;
  /** Per-mode event count badge. Optional but recommended so users
   *  see "Tonight · 3" instead of tapping into an empty surface. */
  counts?: Partial<Record<TodayTimeMode, number>>;
}) {
  return (
    <nav aria-label="When?" className="-mx-4 px-4">
      <div className="shelf-rail gap-1.5 pb-1">
        {CHIPS.map(({ key, label, Icon }) => (
          <Pill
            key={key}
            tone="ink"
            size="sm"
            icon={<Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}
            href={`/today?t=${key}`}
            active={key === active}
            count={counts?.[key]}
          >
            {label}
          </Pill>
        ))}
      </div>
    </nav>
  );
}
