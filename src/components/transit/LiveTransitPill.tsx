"use client";

import { useEffect, useState } from "react";

/**
 * LiveTransitPill — a live "N buses moving now" indicator, polled from
 * /api/transit/vehicles (GTFS-realtime). The visible proof TransIT is
 * running right now, and free. Renders nothing until the first successful
 * read, and nothing if the feed reports zero (honest — no fake activity).
 * Reusable on the transit page and the Pulse "what's moving" layer.
 */
export default function LiveTransitPill() {
  const [count, setCount] = useState<number | null>(null);
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/transit/vehicles", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { vehicles?: unknown[] };
        if (alive && Array.isArray(d.vehicles)) {
          setCount(d.vehicles.length);
          setAgo(0);
        }
      } catch {
        /* keep last known */
      }
    };
    load();
    const poll = setInterval(load, 20_000);
    const tick = setInterval(() => setAgo((a) => a + 1), 1_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (count === null || count === 0) return null;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        color: "var(--app-ink-2)",
        boxShadow: "var(--app-edge), var(--app-hi)",
      }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: "var(--app-positive)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--app-positive) 22%, transparent)" }}
      />
      <span className="tabular-nums">{count}</span> TransIT bus{count === 1 ? "" : "es"} moving now
      <span style={{ color: "var(--app-positive)" }}>· free</span>
      <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
        · {ago}s ago
      </span>
    </div>
  );
}
