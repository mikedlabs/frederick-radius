import Link from "next/link";
import { Zap, MoonStar, CalendarRange, CalendarDays, Clock } from "lucide-react";
import Pill from "@/components/ui/Pill";

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
 *
 * The "Open now" pill at the end is a sibling control for the PLACE
 * layer, not the event layer — toggles ?open=now and collapses the
 * place pool to spots currently open (or closing soon). Visually
 * separated by a hairline so it doesn't read as a 5th event mode.
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
  sub,
  counts,
  openNow,
  openNowCount,
}: {
  active: TimeMode;
  /** Pass the current ?intent= through so chip taps preserve it. */
  intent?: string;
  /** Pass the current ?sub= through so chip taps preserve it. */
  sub?: string;
  /** Per-mode event count so a user sees "Tonight · 3" instead of
   *  tapping into an empty map. */
  counts?: Partial<Record<TimeMode, number>>;
  /** Whether the ?open=now place filter is active. */
  openNow?: boolean;
  /** Count of currently-open places in the active intent/sub pool.
   *  Surfaced next to the toggle so the user sees the impact before
   *  they tap. */
  openNowCount?: number;
}) {
  const hrefFor = (mode: TimeMode): string => {
    const qs = new URLSearchParams();
    if (intent) qs.set("intent", intent);
    if (sub) qs.set("sub", sub);
    qs.set("t", mode);
    if (openNow) qs.set("open", "now");
    return `/explore?${qs.toString()}`;
  };
  const openHref = (): string => {
    const qs = new URLSearchParams();
    if (intent) qs.set("intent", intent);
    if (sub) qs.set("sub", sub);
    qs.set("t", active);
    // Toggle: present → remove; absent → set
    if (!openNow) qs.set("open", "now");
    return `/explore?${qs.toString()}`;
  };

  // No outer absolute wrapper anymore — MapIntentChips renders this
  // strip inside its own space-y-2 stack, so the layout flows
  // naturally regardless of which rows above it are visible (active
  // banner, sub-intents, etc.). The earlier `top: calc(...+56px)`
  // hardcode assumed exactly ONE chip row above; once the banner/sub
  // rows joined the picture, it overlapped the intent chips strip.
  return (
    <div
      className="pointer-events-auto mx-auto flex w-full max-w-[680px] gap-1.5 overflow-x-auto rounded-full p-1 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        background: "color-mix(in srgb, var(--app-bg-elevated) 80%, transparent)",
        boxShadow: "var(--app-shadow-1)",
      }}
      aria-label="Filter map by time"
    >
        {CHIPS.map(({ key, label, Icon }) => (
          <Pill
            key={key}
            tone="ink"
            size="sm"
            bare
            icon={<Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
            href={hrefFor(key)}
            active={key === active}
            count={counts?.[key]}
          >
            {label}
          </Pill>
        ))}
        {/* Hairline + Open-now pill — visually separated so it doesn't
            read as a 5th event time mode. Different control surface
            (places, not events); same row because both are temporal. */}
        <span
          aria-hidden
          className="mx-0.5 my-1 w-px shrink-0 self-stretch"
          style={{ background: "color-mix(in srgb, var(--app-ink) 12%, transparent)" }}
        />
        <Link
          href={openHref()}
          aria-pressed={openNow ? "true" : "false"}
          aria-label={openNow ? "Show all places" : "Show only places open now"}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition active:scale-[0.97]"
          style={{
            background: openNow ? "var(--app-positive)" : "transparent",
            color: openNow ? "#fff" : "var(--app-positive)",
            border: openNow
              ? "1px solid var(--app-positive)"
              : "1px solid color-mix(in srgb, var(--app-positive) 35%, transparent)",
          }}
        >
          <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Open now
          {typeof openNowCount === "number" && (
            <span
              className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums"
              style={{
                background: openNow
                  ? "rgba(255,255,255,0.25)"
                  : "color-mix(in srgb, var(--app-positive) 12%, transparent)",
                color: openNow ? "#fff" : "var(--app-positive)",
              }}
            >
              {openNowCount}
            </span>
          )}
        </Link>
    </div>
  );
}
