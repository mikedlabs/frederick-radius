import Link from "next/link";
import { Zap, MoonStar, CalendarRange, CalendarDays } from "lucide-react";

/**
 * MapTimeChips — temporal control for the event layer on /map. The
 * brief's "time is a first-class dimension" lives here: a single chip
 * row lets users pivot the map between Now, Tonight, This Weekend, and
 * the full Upcoming list. Mode lives in the ?t= search param so the
 * view is shareable.
 *
 * Renders just below MapIntentChips. The two chip strips together act
 * as a "what kind?" + "when?" filter pair the brief calls out as the
 * core differentiator vs. a generic POI map.
 */

export type TimeMode = "now" | "tonight" | "weekend" | "all";

const CHIPS: Array<{
  key: TimeMode;
  label: string;
  Icon: typeof Zap;
}> = [
  { key: "now", label: "Now", Icon: Zap },
  { key: "tonight", label: "Tonight", Icon: MoonStar },
  { key: "weekend", label: "Weekend", Icon: CalendarRange },
  { key: "all", label: "Upcoming", Icon: CalendarDays },
];

export default function MapTimeChips({
  active,
  intent,
  counts,
}: {
  active: TimeMode;
  /** Pass the current ?intent= through so chip taps preserve it. */
  intent?: string;
  /** Per-mode event count so a user sees "Tonight · 3" instead of
   *  tapping into an empty map. */
  counts?: Partial<Record<TimeMode, number>>;
}) {
  const hrefFor = (mode: TimeMode): string => {
    const qs = new URLSearchParams();
    if (intent) qs.set("intent", intent);
    qs.set("t", mode);
    // /map is a legacy redirect to /browse — point chip taps directly
    // at /browse to avoid the extra 308 hop on every filter change.
    return `/browse?${qs.toString()}`;
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 px-2.5 sm:px-3"
      style={{
        // Sit just below MapIntentChips (which already accounts for
        // safe-area + header). 56px is the standard chip-row height
        // we use across the app; tweak together if either changes.
        top: "calc(2.5rem + env(safe-area-inset-top, 0px) + 18px + 56px)",
      }}
      aria-label="Filter map by time"
    >
      <div
        className="pointer-events-auto mx-auto flex w-full max-w-[680px] gap-1.5 overflow-x-auto rounded-full p-1 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          background: "color-mix(in srgb, var(--app-bg-elevated) 80%, transparent)",
          boxShadow: "var(--app-shadow-1)",
        }}
      >
        {CHIPS.map(({ key, label, Icon }) => {
          const isActive = key === active;
          const n = counts?.[key];
          return (
            <Link
              key={key}
              href={hrefFor(key)}
              aria-current={isActive ? "page" : undefined}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition active:scale-[0.97]"
              style={{
                background: isActive ? "var(--app-ink)" : "transparent",
                color: isActive ? "var(--app-bg)" : "var(--app-ink-2)",
              }}
            >
              <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {label}
              {typeof n === "number" && (
                <span
                  className="ml-0.5 rounded-full px-1.5 py-0 text-[9px] font-bold tabular-nums"
                  style={{
                    background: isActive
                      ? "color-mix(in srgb, var(--app-bg) 22%, transparent)"
                      : "color-mix(in srgb, var(--app-ink) 8%, transparent)",
                    color: isActive ? "var(--app-bg)" : "var(--app-ink-3)",
                  }}
                >
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
