"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plane } from "lucide-react";

/**
 * PlanesOverhead — a live "airspace radar" for Frederick. Polls the cached
 * /api/aircraft proxy (free airplanes.live ADS-B) and plots every transmitting
 * aircraft within ~60 nm as a field-guide instrument: Frederick at the center,
 * range rings, a slow sweep, each plane placed by its bearing + distance and
 * rotated to its heading, colored by altitude band. Tap one to read its
 * "specimen card." Honest about ADS-B's blind spots; never invents a track.
 */

type Ac = {
  hex: string;
  flight: string | null;
  type: string | null;
  desc: string | null;
  alt: number | null;
  gs: number | null;
  track: number | null;
  lat: number;
  lon: number;
  dst: number | null;
  dir: number | null;
  emergency: string | null;
};

const MAX_NM = 60;
const RINGS = [20, 40, 60];
const SIZE = 320;
const C = SIZE / 2;
const R = 150;

// Altitude bands → the radar's only color encoding (low traffic is what you'd
// actually crane your neck for; high airliners recede). One-line legend below.
function band(alt: number | null): { color: string; label: string } {
  if (alt == null || alt < 5_000) return { color: "var(--app-brand)", label: "Low · under 5k ft" };
  if (alt < 18_000) return { color: "var(--app-accent)", label: "Mid · 5–18k ft" };
  return { color: "var(--app-cool)", label: "High · 18k ft+" };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg: number | null): string => (deg == null ? "" : COMPASS[Math.round(((deg % 360) / 45)) % 8]);
const fmtAlt = (a: number | null): string => (a == null ? "altitude n/a" : `${a.toLocaleString()} ft`);

function pos(dst: number | null, dir: number | null): { x: number; y: number } | null {
  if (dst == null || dir == null) return null;
  const r = Math.min(dst / MAX_NM, 1) * R;
  const a = (dir * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function Radar({ planes, selected, onSelect }: { planes: Ac[]; selected: string | null; onSelect: (hex: string) => void }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label="Live radar of aircraft over Frederick" style={{ maxWidth: 360, margin: "0 auto", display: "block" }}>
      {/* Paper dial */}
      <circle cx={C} cy={C} r={R + 6} fill="var(--app-bg-elevated-solid)" stroke="color-mix(in srgb, var(--app-brand-2) 40%, var(--app-border))" strokeWidth="1.5" />
      {/* Range rings + labels */}
      {RINGS.map((nm) => {
        const rr = (nm / MAX_NM) * R;
        return (
          <g key={nm}>
            <circle cx={C} cy={C} r={rr} fill="none" stroke="color-mix(in srgb, var(--app-brand-2) 22%, transparent)" strokeWidth="1" strokeDasharray={nm === MAX_NM ? "none" : "2 4"} />
            <text x={C + 3} y={C - rr + 11} className="radar-mono" fill="var(--app-ink-3)">{nm}</text>
          </g>
        );
      })}
      {/* Crosshair + N marker */}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="color-mix(in srgb, var(--app-brand-2) 16%, transparent)" strokeWidth="1" />
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="color-mix(in srgb, var(--app-brand-2) 16%, transparent)" strokeWidth="1" />
      <text x={C} y={C - R + 1} textAnchor="middle" className="radar-mono" fill="var(--app-brand-2)" style={{ fontWeight: 700 }}>N</text>
      {/* Sweep */}
      <line x1={C} y1={C} x2={C} y2={C - R} stroke="var(--app-brand-2)" strokeWidth="1.5" opacity="0.35" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="5s" repeatCount="indefinite" />
      </line>
      {/* Frederick at center */}
      <circle cx={C} cy={C} r="3.5" fill="var(--app-brand-2)" />
      <text x={C} y={C + 16} textAnchor="middle" className="radar-mono" fill="var(--app-brand-2)" style={{ fontWeight: 700, letterSpacing: "0.12em" }}>FREDERICK</text>
      {/* Aircraft */}
      {planes.map((p) => {
        const xy = pos(p.dst, p.dir);
        if (!xy) return null;
        const { color } = band(p.alt);
        const sel = p.hex === selected;
        const c = p.emergency ? "var(--app-danger)" : color;
        const rot = p.track ?? 0;
        return (
          <g key={p.hex} transform={`translate(${xy.x} ${xy.y})`} onClick={() => onSelect(p.hex)} style={{ cursor: "pointer" }}>
            {sel && <circle r="11" fill="none" stroke={c} strokeWidth="1.5" opacity="0.9" />}
            <g transform={`rotate(${rot})`}>
              <path d="M0,-6 L4,5 L0,2.5 L-4,5 Z" fill={c} stroke="var(--app-bg-elevated-solid)" strokeWidth="0.5" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "live";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

export default function PlanesOverhead() {
  const [planes, setPlanes] = useState<Ac[]>([]);
  const [at, setAt] = useState<number>(0);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/aircraft", { cache: "no-store" });
        const json = (await res.json()) as { aircraft: Ac[]; at: number; error?: boolean };
        if (!alive) return;
        setPlanes(json.aircraft);
        setAt(json.at || Date.now());
        setNow(Date.now());
        setStatus(json.error && json.aircraft.length === 0 ? "error" : "ok");
        firstLoad.current = false;
      } catch {
        if (alive && firstLoad.current) setStatus("error");
      }
    };
    load();
    const poll = setInterval(load, 20_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, []);

  // The "specimen list" — nearest first, the ones you could actually spot.
  const featured = useMemo(() => planes.slice(0, 6), [planes]);
  const sel = useMemo(() => planes.find((p) => p.hex === selected) ?? null, [planes, selected]);

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", backgroundImage: "var(--app-paper-light)", boxShadow: "var(--app-edge), var(--app-hi)" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-2)" }}>Airspace radar</span>
          <span className="font-mono text-[10px] tabular-nums" style={{ color: status === "ok" ? "var(--app-positive)" : "var(--app-ink-3)" }}>
            {status === "ok" ? `${planes.length} in range · ${ago(at, now)}` : status === "loading" ? "scanning…" : "feed offline"}
          </span>
        </div>
        <Radar planes={planes} selected={selected} onSelect={setSelected} />
        {/* Altitude legend — the radar's one color encoding. */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {[{ c: "var(--app-brand)", t: "Low" }, { c: "var(--app-accent)", t: "Mid" }, { c: "var(--app-cool)", t: "High" }].map((l) => (
            <span key={l.t} className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: l.c }} />{l.t}
            </span>
          ))}
        </div>
        <style>{`.radar-mono{font-family:var(--font-mono),ui-monospace,monospace;font-size:9px;}`}</style>
      </div>

      {/* Selected specimen, then the nearest few. */}
      {status === "error" && planes.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Couldn&rsquo;t reach the live feed just now. The planes are still up there; try again in a moment.
        </p>
      ) : (
        <ul className="space-y-2">
          {(sel ? [sel, ...featured.filter((p) => p.hex !== sel.hex)] : featured).slice(0, 6).map((p) => (
            <li key={p.hex}>
              <Specimen p={p} active={p.hex === selected} onSelect={() => setSelected(p.hex)} />
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Live ADS-B via{" "}
        <a href="https://airplanes.live" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--app-cool)" }}>airplanes.live</a>.
        Only aircraft that transmit appear, so small planes may be missing. Frederick sits at the edge of the
        Washington Special Flight Rules Area, so some traffic holds or reroutes overhead, and the county is the
        home ground of aviation pioneer Glenn L. Martin.
      </p>
    </div>
  );
}

function Specimen({ p, active, onSelect }: { p: Ac; active: boolean; onSelect: () => void }) {
  const { color } = band(p.alt);
  const c = p.emergency ? "var(--app-danger)" : color;
  const title = p.flight || p.type || p.hex.toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="tactile-interactive relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] border px-3 py-2.5 text-left"
      style={{
        borderColor: active ? `color-mix(in srgb, ${c} 55%, var(--app-border))` : "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: active ? "var(--app-elev-1), var(--app-edge), var(--app-hi)" : "var(--app-edge), var(--app-hi)",
      }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c }} />
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>
        <Plane className="h-[18px] w-[18px]" strokeWidth={2} style={{ transform: `rotate(${(p.track ?? 0) - 45}deg)` }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate font-serif text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {title}
            {p.desc && <span className="font-sans text-[12px] font-normal" style={{ color: "var(--app-ink-3)" }}>{`  ·  ${p.desc}`}</span>}
          </h3>
          {p.emergency && (
            <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-danger)" }}>{p.emergency}</span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
          {fmtAlt(p.alt)}
          {p.gs != null && <span style={{ color: "var(--app-ink-3)" }}>{`  ·  ${p.gs} kt`}</span>}
          {p.dst != null && p.dir != null && (
            <span style={{ color: "var(--app-ink-3)" }}>{`  ·  ${Math.round(p.dst)} nm ${compass(p.dir)}`}</span>
          )}
          {p.track != null && <span style={{ color: "var(--app-ink-3)" }}>{`  ·  hdg ${compass(p.track)}`}</span>}
        </p>
      </div>
    </button>
  );
}
