"use client";

import { useEffect, useState } from "react";
import { Bus } from "lucide-react";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * LiveTransitBoard — a live county "system board" for TransIT.
 *
 * The flat "15 buses moving now" pill, made visual: a field-guide map of
 * Frederick County with every bus that's reporting RIGHT NOW placed at its
 * real position and pointed in its real heading, refreshed every 20s off the
 * Passio GTFS-realtime feed (/api/transit/vehicles → {vehicleId, routeId,
 * lat, lng, bearing}). The towns are faint reference points so the movement
 * reads geographically; Frederick is the hub.
 *
 * Honest by construction: real lat/lng (5dp) and real bearings only — a bus
 * with no reported heading is a plain dot, never a guessed arrow; a bus
 * outside the county frame is dropped, not clamped into a lie. Degrades to a
 * quiet line when the feed is down or nothing is running (late night), with
 * the static map still showing the network's shape.
 */

type LiveVehicle = {
  vehicleId?: string;
  routeId?: string;
  lat: number;
  lng: number;
  bearing?: number;
};

// Frederick County bbox [south, west, north, east] — matches the server-side
// transit normalizers (transitFrederick.ts), so towns and buses share one frame.
const BBOX = [39.265, -77.7, 39.745, -77.15] as const;
// viewBox aspect ≈ the county's true aspect at this latitude ((E-W)·cos(lat) :
// (N-S) ≈ 0.42 : 0.48), so the equirectangular projection isn't squished.
const VW = 320;
const VH = 360;
const PAD = 20;

// A few anchors labeled for orientation (hub + the compass corners); the rest
// render as quiet dots so the board reads as a map, not a word cloud.
const LABELLED = new Set(["frederick", "thurmont", "emmitsburg", "brunswick", "mount-airy"]);

function project(lat: number, lng: number): { x: number; y: number; inFrame: boolean } {
  const [s, w, n, e] = BBOX;
  const nx = (lng - w) / (e - w);
  const ny = (n - lat) / (n - s);
  return {
    x: PAD + nx * (VW - 2 * PAD),
    y: PAD + ny * (VH - 2 * PAD),
    inFrame: nx >= -0.02 && nx <= 1.02 && ny >= -0.02 && ny <= 1.02,
  };
}

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  return `${m}m ago`;
}

export default function LiveTransitBoard() {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [at, setAt] = useState<number>(0);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/transit/vehicles", { cache: "no-store" });
        if (!r.ok) throw new Error("bad status");
        const d = (await r.json()) as { vehicles?: LiveVehicle[]; updatedAt?: number };
        if (!alive) return;
        setVehicles(Array.isArray(d.vehicles) ? d.vehicles : []);
        setAt(d.updatedAt ?? Date.now());
        setStatus("ok");
        setNow(Date.now());
      } catch {
        if (alive) setStatus((s) => (s === "loading" ? "error" : s)); // keep last good data
      }
    };
    load();
    const poll = setInterval(load, 20_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const running = vehicles.length;
  const placed = vehicles
    .map((v) => ({ v, p: project(v.lat, v.lng) }))
    .filter((x) => x.p.inFrame);
  const secondsAgo = at ? Math.max(0, Math.floor((now - at) / 1000)) : 0;

  return (
    <section aria-labelledby="transit-board-eyebrow" className="space-y-2.5">
      {/* Header — count + free + freshness, the pill's voice in mono. */}
      <div className="flex items-center justify-between gap-3">
        <p
          id="transit-board-eyebrow"
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full${status === "ok" && running > 0 ? " pulse-dot" : ""}`}
            style={{ background: running > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}
          />
          TransIT, live
        </p>
        <p className="font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
          {status === "loading"
            ? "locating buses…"
            : status === "error" && running === 0
              ? "feed momentarily down"
              : `${running} moving · ${ago(secondsAgo)}`}
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          role="img"
          aria-label={`Live map of ${running} TransIT bus${running === 1 ? "" : "es"} across Frederick County`}
          style={{ display: "block" }}
        >
          {/* Towns — quiet reference points; Frederick is the hub. */}
          {MUNICIPALITIES.map((m) => {
            const { x, y, inFrame } = project(m.centroid.lat, m.centroid.lng);
            if (!inFrame) return null;
            const hub = m.slug === "frederick";
            const label = LABELLED.has(m.slug);
            return (
              <g key={m.slug}>
                <circle
                  cx={x}
                  cy={y}
                  r={hub ? 3 : 1.8}
                  fill={hub ? "var(--app-brand-2)" : "color-mix(in srgb, var(--app-ink-3) 55%, transparent)"}
                />
                {label && (
                  <text
                    x={x}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize={hub ? 9.5 : 8}
                    fontFamily="var(--font-mono, monospace)"
                    letterSpacing="0.06em"
                    fill={hub ? "var(--app-brand-2)" : "var(--app-ink-3)"}
                    stroke="var(--app-bg-elevated-solid)"
                    strokeWidth={3}
                    style={{ fontWeight: hub ? 700 : 500, paintOrder: "stroke" }}
                  >
                    {hub ? "FREDERICK" : m.name.replace(/^Downtown\s+/, "").toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {/* Live buses — placed by real position, pointed by real bearing.
              No bearing → a plain dot (never a guessed arrow). */}
          {placed.map(({ v, p }, i) => {
            const key = v.vehicleId ?? `${v.lat},${v.lng},${i}`;
            return (
              <g key={key} transform={`translate(${p.x} ${p.y})`}>
                <circle
                  r="7"
                  fill="color-mix(in srgb, var(--app-brand) 18%, transparent)"
                  className="pulse-dot"
                />
                {v.bearing != null ? (
                  <g transform={`rotate(${v.bearing})`}>
                    <path
                      d="M0,-5 L3.4,4.2 L0,2 L-3.4,4.2 Z"
                      fill="var(--app-brand)"
                      stroke="var(--app-bg-elevated-solid)"
                      strokeWidth="0.6"
                    />
                  </g>
                ) : (
                  <circle r="3" fill="var(--app-brand)" stroke="var(--app-bg-elevated-solid)" strokeWidth="0.6" />
                )}
              </g>
            );
          })}
        </svg>

        {/* Empty / late-night state, overlaid on the static map. */}
        {status !== "loading" && running === 0 && (
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-2 text-[12px]"
            style={{ background: "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)", color: "var(--app-ink-3)" }}
          >
            <Bus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {status === "error" ? "Live feed momentarily down" : "No buses running right now"}
          </div>
        )}
      </div>

      <p className="text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Live positions from TransIT&rsquo;s GTFS-realtime feed, refreshed every
        20 seconds. The county bus is free.
      </p>
    </section>
  );
}
