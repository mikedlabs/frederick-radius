import { Sun } from "lucide-react";
import { FREDERICK_CENTER } from "@/lib/geo";
import { goldenHourWindow } from "@/lib/today/golden-hour";

/**
 * GoldenHourCard — a calm almanac beat in the day's live layer: today's sunset
 * and the ~hour of good light before it. Frederick's most romantic data, and the
 * one number a photographer, a patio-seeker, or anyone chasing the view wants in
 * the hour before dusk. Self-hides outside that window (mid-day, deep night), so
 * it appears exactly when it's useful. Every minute is real NOAA sun math
 * (lib/sun), never a guessed time.
 *
 * Server component computed from `now` — the light window runs ~60–90 min, well
 * inside the page's 5-minute ISR granularity, so it stays honest without a live
 * clock. (The masthead carries a one-line golden cue; this is the promoted beat
 * with the sunset time named.)
 */
export default function GoldenHourCard({ now }: { now: Date }) {
  const win = goldenHourWindow(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  if (!win) return null;

  const goldenStart = fmt(win.goldenStart);
  const sunset = fmt(win.sunset);
  const heading = win.active ? "Golden hour is underway." : "Golden hour starts soon.";
  const detail = win.active
    ? `The calculated golden-hour window continues until ${sunset}.`
    : `The calculated golden-hour window runs from ${goldenStart} to ${sunset}.`;

  return (
    <section aria-label="Golden hour" className="mt-4">
      <div
        className="flex items-center gap-3 rounded-[var(--app-radius-lg)] border px-4 py-3"
        style={{
          borderColor: "color-mix(in srgb, var(--app-accent) 30%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-accent) 7%, var(--app-bg-elevated))",
          boxShadow: "var(--app-edge), var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-accent) 16%, transparent)" }}
        >
          <Sun className="h-5 w-5" strokeWidth={2} style={{ color: "var(--app-accent)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
            {heading}
          </p>
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {detail}
          </p>
        </div>
        <span className="shrink-0 text-right font-mono text-[11px] tabular-nums leading-tight" style={{ color: "var(--app-ink-3)" }}>
          <span className="block uppercase tracking-[0.1em]">Sunset</span>
          <span className="block text-[13px]" style={{ color: "var(--app-ink)" }}>{sunset}</span>
        </span>
      </div>
    </section>
  );
}

/** "8:41 PM"-style Eastern time. */
function fmt(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
