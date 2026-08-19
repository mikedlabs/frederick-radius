"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Play, Pause, X } from "lucide-react";
import { formatHourLabel } from "./dockCaption";

/**
 * TimeScrubber — the /map "living map" time control.
 *
 * Drag through the day and the map re-evaluates what's on at that hour (event
 * markers now; place open/closed via feature-state). "Now" snaps to the live
 * hour; "Play the day" sweeps 6am → midnight so the county animates itself.
 *
 * State model: the parent owns a single `hour` (null = off / live). Off shows
 * a quiet pill; activating seeds it to the current Frederick hour. This keeps
 * the wiring to one value and one setter, and the scrubber never touches
 * the server mode branch or refetches — it's pure client state layered on the
 * existing browse map.
 *
 * Two layouts:
 *   - inline (default): the "The day" row inside the map dock's When pane.
 *     The dock owns positioning; the scrubber is plain flow content.
 *   - floating: the pre-dock overlay placement, kept for full-bleed maps
 *     that have no dock (SavedList's map) so nothing regresses there.
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

export default function TimeScrubber({
  hour,
  onChange,
  floating = false,
}: {
  hour: number | null;
  onChange: (h: number | null) => void;
  /** Legacy overlay placement for dock-less full-bleed maps. */
  floating?: boolean;
}) {
  const active = hour != null;
  const [playing, setPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // How many places actually carry a fresh, publishable schedule. When the
  // rolling hours refresh stalls past the 7-day window, this hits ZERO and the
  // open/closed dimming silently becomes a no-op: scrubbing to 3am looked
  // identical to noon (data audit 2026-08-18). A control that cannot answer
  // must say so, not shrug. Lazy-loaded on activation, matching AppMap's own
  // deferred import of the same artifact, so the dock's initial chunk stays
  // light. Event markers keep working either way; only place marks pause.
  const [hoursCoverage, setHoursCoverage] = useState<number | null>(null);
  useEffect(() => {
    if (!active || hoursCoverage != null) return;
    let cancelled = false;
    import("@/lib/loaders/places-client-hours").then((mod) => {
      if (!cancelled) setHoursCoverage(mod.clientPlaceHours().length);
    });
    return () => { cancelled = true; };
  }, [active, hoursCoverage]);

  // Autoplay: quarter-hour steps are enough to communicate openings and event
  // starts. They also prevent the map from recomputing 1,000+ place states for
  // visually indistinguishable eight-minute increments. ~18 hours in 18s.
  useEffect(() => {
    if (!playing || !active) return;
    const id = setInterval(() => {
      onChange(((hour ?? START) + 0.25 >= END ? START : (hour ?? START) + 0.25));
    }, 250);
    return () => clearInterval(id);
  }, [playing, active, hour, onChange]);

  if (!active) {
    const pill = (
      <button
        type="button"
        onClick={() => onChange(currentFrederickHour())}
        className="tap-44 pointer-events-auto inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold shadow-[var(--app-shadow-1)]"
        style={{
          background: "var(--app-bg-elevated)",
          border: "1px solid var(--app-border)",
          color: "var(--app-ink-2)",
        }}
      >
        <Clock className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
        See the day
      </button>
    );
    if (!floating) return pill;
    return (
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
        // Sit above the bottom nav reserve on notched phones (see the
        // pre-dock placement notes in git history).
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--app-bottomnav-reserve, 0px) + 56px)" }}
      >
        {pill}
      </div>
    );
  }

  const pct = ((hour! - START) / (END - START)) * 100;

  function setFromClientX(cx: number) {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (cx - r.left) / r.width));
    // Quarter-hour steps, the same grain autoplay uses. Per-pixel values made
    // one finger-drag emit hundreds of distinct hours, and every one re-ran
    // the open/closed pass over every scoped place. ~72 possible positions
    // are visually identical and an order of magnitude cheaper.
    onChange(START + Math.round(p * (END - START) * 4) / 4);
  }

  const card = (
    <div
      className={
        floating
          ? "pointer-events-auto w-full max-w-[420px] rounded-[var(--app-radius-lg)] px-3.5 pb-3 pt-2.5 shadow-[var(--app-shadow-2)] backdrop-blur"
          : "w-full rounded-[var(--app-radius-sm)] px-3.5 pb-3 pt-2.5"
      }
      style={{
        background: floating
          ? "color-mix(in srgb, var(--app-bg-elevated) 90%, transparent)"
          : "var(--app-bg-elevated)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
          {formatHourLabel(hour!)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setPlaying(false); onChange(currentFrederickHour()); }}
            className="inline-flex min-h-11 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Now
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play the day"}
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: playing ? "var(--app-brand-press)" : "var(--app-brand-tint-14)", color: playing ? "var(--app-on-brand)" : "var(--app-brand-press)" }}
          >
            {playing ? <Pause className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Play className="h-3.5 w-3.5" strokeWidth={2.5} />}
          </button>
          <button
            type="button"
            onClick={() => { setPlaying(false); onChange(null); }}
            aria-label="Back to now"
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ color: "var(--app-ink-3)" }}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-6"
        // The track IS a slider: claim the gesture here, not only on the
        // 20px thumb, or a scrub that starts on the band scrolls the dock
        // pane instead of moving time (mobile audit 2026-08-18).
        style={{ touchAction: "none" }}
        onPointerDown={(e) => { setPlaying(false); draggingRef.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setFromClientX(e.clientX); }}
        onPointerMove={(e) => { if (draggingRef.current) setFromClientX(e.clientX); }}
        onPointerUp={() => { draggingRef.current = false; }}
        // The OS can revoke a captured pointer mid-drag (notification pull,
        // app switch). Without this the scrubber stayed "dragging" forever.
        onPointerCancel={() => { draggingRef.current = false; }}
      >
        {/* Invisible band growing the 24px track to a 44px effective target.
            Downward only: the header row sits 4px above, while the tick
            labels below are non-interactive, so this steals nothing. */}
        <div aria-hidden className="absolute inset-x-0 top-0 -bottom-5" />
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: "var(--app-border)" }} />
        <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ width: `${pct}%`, background: "color-mix(in srgb, var(--app-brand) 55%, transparent)" }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Time of day"
          aria-valuemin={START}
          aria-valuemax={END}
          aria-valuenow={Math.round(hour! * 10) / 10}
          aria-valuetext={formatHourLabel(hour!)}
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
      {hoursCoverage === 0 && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          Confirmed hours are refreshing, so open and closed marks are paused.
          Events still move with the day.
        </p>
      )}
    </div>
  );

  if (!floating) return card;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3"
      style={{ bottom: "calc(var(--app-bottomnav-reserve, 0px) + 10px)" }}
    >
      {card}
    </div>
  );
}
