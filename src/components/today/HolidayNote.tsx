import { Flag } from "lucide-react";
import { holidayOn } from "@/lib/holidays";

/**
 * HolidayNote — a calm, self-hiding almanac line for /today: when today is a
 * federal holiday, it names it and states the real closure implication (banks,
 * post offices, government offices), so a plan-the-day visit isn't surprised by
 * a closed county office. Honest civic context, not a celebration banner.
 * Server component; renders nothing on an ordinary day.
 */
export default function HolidayNote({ now }: { now: Date }) {
  const h = holidayOn(now);
  if (!h) return null;

  return (
    <aside
      className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-2.5"
      style={{
        borderColor: "color-mix(in srgb, var(--app-cool) 22%, var(--app-border))",
        backgroundColor: "color-mix(in srgb, var(--app-cool) 5%, var(--app-bg-elevated-solid))",
        backgroundImage: "var(--app-paper-light)",
      }}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
        style={{
          background: "color-mix(in srgb, var(--app-cool) 15%, var(--app-bg-elevated))",
          boxShadow: "var(--app-edge), var(--app-hi)",
          color: "var(--app-cool)",
        }}
      >
        <Flag className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
          {h.name}
          {h.observed && (
            <span className="ml-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              observed
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {h.closures}
        </p>
      </div>
    </aside>
  );
}
