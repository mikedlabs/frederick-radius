/**
 * Renders Google's human-readable weekday hours (e.g. "Monday: 9 AM – 5 PM").
 * Used when we have no structured seed `hours` but Google gave us strings.
 * Today's row is emphasized. No interactivity → server component.
 */
import PlaceSectionLabel from "./PlaceSectionLabel";

const NY_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
});

export default function GoogleHours({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  const today = NY_WEEKDAY.format(new Date());

  return (
    // PLAIN TOOL: ruled day rows under the section label, no box.
    <section className="space-y-2">
      <PlaceSectionLabel>Hours</PlaceSectionLabel>
      <ul
        className="divide-y divide-[var(--app-border)] border-t text-[15px]"
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
