"use client";

import { useState } from "react";

/**
 * TimeLens (prototype) — a day scrubber. Drag the slider through the 24h day and
 * the sky band, the "what the light is doing" line, and the events list all
 * re-reveal for that minute. Pure client interaction over server-computed sun
 * windows + today's unified events; no heavy data crosses the wire.
 */

type Windows = {
  sunrise: number | null;
  goldenMorningEnd: number | null;
  goldenEveningStart: number | null;
  sunset: number | null;
  dusk: number | null;
};
type LensEvent = { title: string; category: string; venue: string; startMin: number };

const fmt = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

// Phase for a scrubbed minute, from the sun windows.
function phaseAt(min: number, w: Windows) {
  const { sunrise, goldenMorningEnd, goldenEveningStart, sunset, dusk } = w;
  if (sunrise == null || sunset == null) return { key: "day", label: "Daylight", grad: ["#9DBBD0", "#C9D8E2"] };
  if (min < sunrise) return { key: "night", label: "Before dawn", grad: ["#1A2433", "#33415A"] };
  if (goldenMorningEnd != null && min < goldenMorningEnd) return { key: "golden-am", label: "Morning golden hour", grad: ["#E9A23B", "#F3CE8E"] };
  if (goldenEveningStart != null && min >= goldenEveningStart && min < sunset) return { key: "golden-pm", label: "Golden hour", grad: ["#E07A3E", "#F2B45C"] };
  if (min >= sunset) {
    if (dusk != null && min < dusk) return { key: "dusk", label: "Dusk", grad: ["#5B4B7A", "#A56B6B"] };
    return { key: "night", label: "After dark", grad: ["#15141F", "#2A2740"] };
  }
  return { key: "day", label: "Open daylight", grad: ["#7FAAC8", "#CFE0EA"] };
}

function Marker({ min, label, total = 1439 }: { min: number | null; label: string; total?: number }) {
  if (min == null) return null;
  const left = `${(min / total) * 100}%`;
  return (
    <div className="pointer-events-none absolute top-0 h-full" style={{ left }}>
      <div className="h-full w-px" style={{ background: "rgba(255,255,255,0.55)" }} />
      <span
        className="absolute top-1 -translate-x-1/2 whitespace-nowrap rounded px-1 font-mono text-[8px] uppercase tracking-wide"
        style={{ background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.9)" }}
      >
        {label}
      </span>
    </div>
  );
}

export default function TimeLens({ windows, events, nowMin }: { windows: Windows; events: LensEvent[]; nowMin: number }) {
  const [min, setMin] = useState(nowMin);
  const phase = phaseAt(min, windows);

  // Events on at / coming up from the scrubbed minute (next 4).
  const upcoming = events.filter((e) => e.startMin >= min).slice(0, 4);
  const earlier = events.filter((e) => e.startMin < min).length;

  return (
    <div className="space-y-4">
      {/* Sky band reflecting the scrubbed time, with sun markers. */}
      <div
        className="relative h-28 w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-border)",
          background: `linear-gradient(180deg, ${phase.grad[0]}, ${phase.grad[1]})`,
          transition: "background 200ms ease",
        }}
      >
        <Marker min={windows.sunrise} label="rise" />
        <Marker min={windows.goldenEveningStart} label="golden" />
        <Marker min={windows.sunset} label="set" />
        <Marker min={windows.dusk} label="dark" />
        {/* The scrubbed-time cursor */}
        <div className="pointer-events-none absolute top-0 h-full" style={{ left: `${(min / 1439) * 100}%` }}>
          <div className="h-full w-0.5" style={{ background: "var(--app-bg)" }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <span className="font-serif text-[22px] font-semibold leading-none" style={{ color: "rgba(255,255,255,0.97)", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
            {fmt(min)}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.92)", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
            {phase.label}
          </span>
        </div>
      </div>

      {/* The scrubber */}
      <input
        type="range"
        min={0}
        max={1439}
        step={5}
        value={min}
        onChange={(e) => setMin(Number(e.target.value))}
        aria-label="Scrub through the day"
        className="w-full accent-[var(--app-brand)]"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMin(nowMin)}
          className="tap-44 rounded-full border px-3 py-1 text-[12px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}
        >
          Now
        </button>
        <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {events.length} events today{earlier > 0 ? ` · ${earlier} earlier` : ""}
        </span>
      </div>

      {/* What's on from this point in the day */}
      <section className="space-y-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-ink-3)" }}>
          On from {fmt(min)}
        </p>
        {upcoming.length === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            Nothing else on the calendar after this. Drag earlier to see the day.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e, i) => (
              <li
                key={`${e.title}-${i}`}
                className="flex items-baseline gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-brand)" }}>{fmt(e.startMin)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{e.title}</span>
                  <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>{e.venue}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
