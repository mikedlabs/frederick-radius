/**
 * Renders Google's human-readable weekday hours (e.g. "Monday: 9 AM – 5 PM").
 * Used when we have no structured seed `hours` but Google gave us strings.
 * Today's row is emphasized. No interactivity → server component.
 */
import { Clock } from "lucide-react";

const NY_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
});

export default function GoogleHours({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  const today = NY_WEEKDAY.format(new Date());

  return (
    <section className="space-y-2">
      <h2
        className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-cool)" }} />
        Hours
      </h2>
      <ul
        className="divide-y rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 text-sm"
        style={{ borderColor: "var(--app-border)" }}
      >
        {lines.map((line) => {
          const [day, ...rest] = line.split(": ");
          const isToday = day === today;
          return (
            <li
              key={line}
              className="flex items-center justify-between py-2"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span
                style={{
                  color: isToday ? "var(--app-ink)" : "var(--app-ink-2)",
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {day}
              </span>
              <span
                className="tabular-nums"
                style={{
                  color: isToday ? "var(--app-ink)" : "var(--app-ink-3)",
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {rest.join(": ")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
