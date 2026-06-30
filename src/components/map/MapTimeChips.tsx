import Link from "next/link";
import { Clock } from "lucide-react";

/**
 * The "Open now" place filter for /map. Toggles ?open=now, collapsing the place
 * pool to spots currently open (or closing soon).
 *
 * This used to also render a Now / Tonight / Weekend / Upcoming event time-mode
 * chip row. Those were removed per the owner: an assume-the-intent preset row
 * reads as the app telling users what to do — the same reason the map's intent
 * quick-picks were cut. Events still render in the map's default ?t= window
 * (chosen server-side by what's actually happening); the map just no longer
 * fronts a "when?" chooser. "Open now" stays because it's a factual place
 * filter the user explicitly drives, not an assumed intent.
 *
 * TimeMode is still exported + the ?t= param still drives the event layer
 * server-side; only the chip UI is gone.
 */

export type TimeMode = "now" | "tonight" | "weekend" | "all";

export default function MapTimeChips({
  active,
  intent,
  sub,
  openNow,
  openNowCount,
}: {
  /** Current ?t= window — preserved when toggling ?open=now. */
  active: TimeMode;
  /** Pass the current ?intent= through so the toggle preserves it. */
  intent?: string;
  /** Pass the current ?sub= through so the toggle preserves it. */
  sub?: string;
  /** Whether the ?open=now place filter is active. */
  openNow?: boolean;
  /** Count of currently-open places, shown next to the toggle. */
  openNowCount?: number;
}) {
  const openHref = (): string => {
    const qs = new URLSearchParams();
    if (intent) qs.set("intent", intent);
    if (sub) qs.set("sub", sub);
    qs.set("t", active);
    // Toggle: present → remove; absent → set
    if (!openNow) qs.set("open", "now");
    return `/map?${qs.toString()}`;
  };

  return (
    <div className="pointer-events-auto flex justify-center">
      <Link
        href={openHref()}
        aria-pressed={openNow ? "true" : "false"}
        aria-label={openNow ? "Show all places" : "Show only places open now"}
        className="tap-44-y inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight backdrop-blur transition active:scale-[0.97]"
        style={{
          background: openNow
            ? "var(--app-positive)"
            : "color-mix(in srgb, var(--app-bg-elevated) 82%, transparent)",
          color: openNow ? "var(--app-on-brand)" : "var(--app-positive)",
          border: openNow
            ? "1px solid var(--app-positive)"
            : "1px solid color-mix(in srgb, var(--app-positive) 35%, transparent)",
          boxShadow: "var(--app-shadow-1)",
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
              color: openNow ? "var(--app-on-brand)" : "var(--app-positive)",
            }}
          >
            {openNowCount}
          </span>
        )}
      </Link>
    </div>
  );
}
