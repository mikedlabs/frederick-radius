import Link from "next/link";
import { Zap, MoonStar, Sunrise, CalendarRange } from "lucide-react";

/**
 * TimeToggle — the brand-defining "when?" control at the top of /today.
 * Lets a user pivot the page between Now, Tonight, Tomorrow, and This
 * Weekend in a single tap. Mode lives in the ?t= URL param so the
 * view is shareable.
 *
 * Renders as a server component (plain anchors via next/link) so the
 * SSR HTML carries the active state on first paint — no client JS
 * needed for the control itself.
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
    <nav
      aria-label="When?"
      className="-mx-4 px-4"
    >
      <div className="shelf-rail gap-1.5 pb-1">
        {CHIPS.map(({ key, label, Icon }) => {
          const isActive = key === active;
          const n = counts?.[key];
          return (
            <Link
              key={key}
              href={`/today?t=${key}`}
              aria-current={isActive ? "page" : undefined}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight transition active:scale-[0.97]"
              style={{
                background: isActive ? "var(--app-ink)" : "var(--app-bg-elevated)",
                color: isActive ? "var(--app-bg)" : "var(--app-ink-2)",
                border: `1px solid ${isActive ? "var(--app-ink)" : "var(--app-border)"}`,
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {label}
              {typeof n === "number" && n > 0 && (
                <span
                  className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums"
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
    </nav>
  );
}
