"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Play, Pause, X } from "lucide-react";

/**
 * TimeScrubber — the /map "living map" time control.
 *
 * Drag through the day and the map re-evaluates what's on at that hour (event
 * markers now; place open/closed in the follow-up). "Now" snaps to the live
 * hour; "Play the day" sweeps 6am → midnight so the county animates itself.
 *
 * State model: the parent owns a single `hour` (null = off / live). Off shows
 * a quiet pill; activating seeds it to the current Frederick hour. This keeps
 * AppMap's wiring to one value and one setter, and the scrubber never touches
 * the server mode branch or refetches — it's pure client state layered on the
 * existing browse map.
 *
 * Reduced-motion: the autoplay still advances time (that's information), it
 * just isn't a required animation; the pulse/transition polish is CSS-gated
 * elsewhere.
 */

const START = 6;
const END = 24;

function currentFrederickHour(): number {
  // Same wall-clock trick the app uses elsewhere (BriefingLine): render the
  // instant in Frederick's zone, then read local hours/minutes off it.
  const local = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const h = local.getHours() + local.getMinutes() / 60;
  return Math.max(START, Math.min(END - 0.1, h));
}

function label(hour: number): string {
  const hh = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const ap = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m < 10 ? "0" : ""}${m} ${ap}`;
}

export default function TimeScrubber({
  hour,
  onChange,
}: {
  hour: number | null;
  onChange: (h: number | null) => void;
}) {
  const active = hour != null;
  const [playing, setPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Autoplay: step time on a light interval (not every frame) so AppMap's
  // re-render stays cheap. ~18 hours over ~22s.
  useEffect(() => {
    if (!playing || !active) return;
    const id = setInterval(() => {
      onChange(((hour ?? START) + 0.13 >= END ? START : (hour ?? START) + 0.13));
    }, 150);
    return () => clearInterval(id);
  }, [playing, active, hour, onChange]);

  if (!active) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
        <button
          type="button"
          onClick={() => onChange(currentFrederickHour())}
          className="tap-44 pointer-events-auto inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold shadow-[var(--app-shadow-2)] backdrop-blur"
          style={{
            background: "color-mix(in srgb, var(--app-bg-elevated) 86%, transparent)",
            border: "1px solid var(--app-border)",
            color: "var(--app-ink-2)",
          }}
        >
          <Clock className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          See the day
        </button>
      </div>
    );
  }

  const pct = ((hour! - START) / (END - START)) * 100;

  function setFromClientX(cx: number) {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (cx - r.left) / r.width));
    onChange(START + p * (END - START));
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div
        className="pointer-events-auto w-full max-w-[420px] rounded-[var(--app-radius-lg)] px-3.5 pb-3 pt-2.5 shadow-[var(--app-shadow-2)] backdrop-blur"
        style={{
          background: "color-mix(in srgb, var(--app-bg-elevated) 90%, transparent)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
            {label(hour!)}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setPlaying(false); onChange(currentFrederickHour()); }}
              className="tap-44 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play the day"}
              className="tap-44 grid h-7 w-7 place-items-center rounded-full"
              style={{ background: playing ? "var(--app-brand)" : "var(--app-brand-tint-2, color-mix(in srgb, var(--app-brand) 14%, transparent))", color: playing ? "#fff" : "var(--app-brand)" }}
            >
              {playing ? <Pause className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Play className="h-3.5 w-3.5" strokeWidth={2.5} />}
            </button>
            <button
              type="button"
              onClick={() => { setPlaying(false); onChange(null); }}
              aria-label="Back to now"
              className="tap-44 grid h-7 w-7 place-items-center rounded-full"
              style={{ color: "var(--app-ink-3)" }}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="relative h-6"
          onPointerDown={(e) => { setPlaying(false); draggingRef.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setFromClientX(e.clientX); }}
          onPointerMove={(e) => { if (draggingRef.current) setFromClientX(e.clientX); }}
          onPointerUp={() => { draggingRef.current = false; }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: "var(--app-border)" }} />
          <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ width: `${pct}%`, background: "color-mix(in srgb, var(--app-brand) 55%, transparent)" }} />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Time of day"
            aria-valuemin={START}
            aria-valuemax={END}
            aria-valuenow={Math.round(hour! * 10) / 10}
            aria-valuetext={label(hour!)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setPlaying(false); onChange(Math.max(START, hour! - 0.5)); e.preventDefault(); }
              if (e.key === "ArrowRight" || e.key === "ArrowUp") { setPlaying(false); onChange(Math.min(END, hour! + 0.5)); e.preventDefault(); }
            }}
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${pct}%`, background: "var(--app-bg-elevated)", border: "2px solid var(--app-brand)", boxShadow: "var(--app-shadow-1)", cursor: "grab", touchAction: "none" }}
          />
        </div>
        <div className="mt-0.5 flex justify-between font-mono text-[9px]" style={{ color: "var(--app-ink-3)" }}>
          <span>6a</span><span>noon</span><span>6p</span><span>12a</span>
        </div>
      </div>
    </div>
  );
}
