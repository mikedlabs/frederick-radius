"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plane } from "lucide-react";

/**
 * PlanesOverhead — live "what's flying over Frederick." Polls the cached
 * /api/aircraft proxy (free airplanes.live ADS-B) and shows every transmitting
 * aircraft within ~60 nm on a real Mapbox map (OverheadMap): each plane plotted
 * at its true position, rotated to its heading, colored by altitude band, tap
 * for a popup with its route + altitude + speed. The nearest few also list as
 * "specimen cards" below. Honest about ADS-B's blind spots; never invents a track.
 */

// Code-split the Mapbox map (mapbox-gl is ~200 KB) so the page shell paints first.
const OverheadMap = dynamic(() => import("./OverheadMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid w-full place-items-center rounded-[var(--app-radius-lg)] border text-[13px]"
      style={{ height: 400, borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
    >
      Loading the map…
    </div>
  ),
});

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
  route?: { from: { iata: string; name: string } | null; to: { iata: string; name: string } | null } | null;
};

// Altitude bands → the marker color encoding (low traffic is what you'd actually
// crane your neck for; high airliners recede). One-line legend below the map.
function band(alt: number | null): { color: string; label: string } {
  if (alt == null || alt < 5_000) return { color: "var(--app-brand)", label: "Low · under 5k ft" };
  if (alt < 18_000) return { color: "var(--app-accent)", label: "Mid · 5–18k ft" };
  return { color: "var(--app-cool)", label: "High · 18k ft+" };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg: number | null): string => (deg == null ? "" : COMPASS[Math.round(((deg % 360) / 45)) % 8]);
const fmtAlt = (a: number | null): string => (a == null ? "altitude n/a" : `${a.toLocaleString()} ft`);
// ADS-B reports ground speed in knots; the UI shows mph (owner preference).
const mph = (kt: number): number => Math.round(kt * 1.15078);

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

  const dead = status === "error" && planes.length === 0;

  return (
    <div className="space-y-4">
      {dead ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Couldn&rsquo;t reach the live feed just now. The planes are still up there; try again in a moment.
        </p>
      ) : (
        <>
          {/* The map — every transmitting aircraft at its real position. */}
          <OverheadMap planes={planes} selected={selected} onSelect={setSelected} height={400} />

          {/* Altitude legend (the marker colors) + freshness. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {[{ c: "var(--app-brand)", t: "Low" }, { c: "var(--app-accent)", t: "Mid" }, { c: "var(--app-cool)", t: "High" }].map((l) => (
                <span key={l.t} className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: l.c }} />{l.t}
                </span>
              ))}
            </div>
            <span className="font-mono text-[9.5px] tabular-nums" style={{ color: status === "ok" ? "var(--app-positive)" : "var(--app-ink-3)" }}>
              {status === "ok" ? `${planes.length} in range · ${ago(at, now)}` : "scanning…"}
            </span>
          </div>

          {/* Selected specimen, then the nearest few. */}
          <ul className="space-y-2">
            {(sel ? [sel, ...featured.filter((p) => p.hex !== sel.hex)] : featured).slice(0, 6).map((p) => (
              <li key={p.hex}>
                <Specimen p={p} active={p.hex === selected} onSelect={() => setSelected(p.hex)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Live ADS-B via{" "}
        <a href="https://airplanes.live" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--app-cool)" }}>airplanes.live</a>,
        routes via{" "}
        <a href="https://hexdb.io" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--app-cool)" }}>hexdb.io</a>.
        Only aircraft that transmit appear, so small planes may be missing, and most private flights carry no published route. Frederick sits at the edge of the
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
        {/* Where it's from and going — resolved from the callsign; only when
            the flight has a published route (most airliners do, GA won't). */}
        {p.route && (p.route.from || p.route.to) && (
          <p
            className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold tabular-nums"
            style={{ color: "var(--app-ink-2)" }}
            title={`${p.route.from?.name ?? "Unknown origin"} → ${p.route.to?.name ?? "Unknown destination"}`}
          >
            <span>{p.route.from?.iata ?? "???"}</span>
            <span aria-hidden style={{ color: "var(--app-ink-3)" }}>→</span>
            <span>{p.route.to?.iata ?? "???"}</span>
          </p>
        )}
        <p className="mt-0.5 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
          {fmtAlt(p.alt)}
          {p.gs != null && <span style={{ color: "var(--app-ink-3)" }}>{`  ·  ${mph(p.gs)} mph`}</span>}
          {p.dst != null && p.dir != null && (
            <span style={{ color: "var(--app-ink-3)" }}>{`  ·  ${Math.round(p.dst)} nm ${compass(p.dir)}`}</span>
          )}
          {p.track != null && <span style={{ color: "var(--app-ink-3)" }}>{`  ·  hdg ${compass(p.track)}`}</span>}
        </p>
      </div>
    </button>
  );
}
