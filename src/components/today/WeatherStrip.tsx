import { Sun, CloudSun, Cloud, CloudRain, Wind } from "lucide-react";

export default function WeatherStrip() {
  // Placeholder static data — NWS API integration is Task 1.x.
  // Today's seed is a partly-sunny spring day in Frederick.
  const hours = [
    { t: "now", temp: 71, label: "Partly sunny", icon: CloudSun },
    { t: "5pm", temp: 73, label: "Sunny", icon: Sun },
    { t: "6pm", temp: 72, label: "Partly cloudy", icon: CloudSun },
    { t: "7pm", temp: 69, label: "Cloudy", icon: Cloud },
    { t: "8pm", temp: 65, label: "Light breeze", icon: Wind },
    { t: "9pm", temp: 62, label: "Clear", icon: Sun },
  ];
  return (
    <div
      className="overflow-x-auto rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-3 py-3 shadow-[var(--app-shadow-1)] scrollbar-hide"
      style={{ borderColor: "var(--app-border)" }}
    >
      <ul className="flex min-w-max items-center gap-5">
        {hours.map((h) => (
          <li key={h.t} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
              {h.t}
            </span>
            <h.icon className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
              {h.temp}°
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
