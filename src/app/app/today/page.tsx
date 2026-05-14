import type { Metadata } from "next";

export const metadata: Metadata = { title: "Today" };

const PLACEHOLDER_MODULES = [
  { id: "weather", title: "Weather", body: "Hourly forecast and air quality from NWS / AirNow." },
  { id: "open-now", title: "Open now nearby", body: "Six cards ranked by distance and editorial weight." },
  { id: "today-events", title: "Happening today", body: "Up to four events live now or starting in the next 3 hours." },
  { id: "weekend", title: "This weekend", body: "Curated picks across all 12 municipalities." },
  { id: "walkable", title: "Walkable from here", body: "Places inside a 15-minute walking radius." },
  { id: "saved", title: "Saved", body: "Your pinned places, events, and radii." },
];

export default function TodayPage() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  return (
    <div className="space-y-6">
      <section className="pt-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          {weekday} · {time}
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Good to see you in Frederick.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The Today screen is the daily-use dashboard. Modules below are scaffolding — wired up in the next sprint with live data.
        </p>
      </section>
      <ul className="space-y-3">
        {PLACEHOLDER_MODULES.map((m) => (
          <li
            key={m.id}
            className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {m.title}
              </h2>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
              >
                Soon
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {m.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
