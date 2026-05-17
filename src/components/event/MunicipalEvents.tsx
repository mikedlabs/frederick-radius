"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import SeriesCard from "./SeriesCard";
import { haptic } from "@/lib/haptics";
import type { IngestedSeries } from "@/lib/loaders/ingested";

/**
 * Mobile-first filter over the ~3,200 municipal events: municipality chips
 * + a search box + recurring/one-off toggle. Client-side so it's instant
 * (the data is already on the page). Caps the rendered list so a phone
 * isn't rendering 1,500 cards.
 */
export default function MunicipalEvents({
  series,
  summary,
}: {
  series: IngestedSeries[];
  summary: { total: number; series: number; recurring: number };
}) {
  const munis = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of series) counts.set(s.municipality, (counts.get(s.municipality) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [series]);

  const [muni, setMuni] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [recurringOnly, setRecurringOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return series.filter((s) => {
      if (muni && s.municipality !== muni) return false;
      if (recurringOnly && !s.isRecurring) return false;
      if (needle) {
        const hay = `${s.title} ${s.venueName ?? ""} ${s.category ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [series, muni, q, recurringOnly]);

  const shown = filtered.slice(0, 50);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Municipal calendars
        </h2>
        <span className="text-xs tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {summary.total.toLocaleString()} events · {summary.recurring} recurring
        </span>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 py-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search story time, market, council…"
          aria-label="Search municipal events"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          autoComplete="off"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear" className="shrink-0">
            <X className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </button>
        )}
      </div>

      {/* Municipality + recurring chips — wrapped, all visible */}
      <div className="flex flex-wrap gap-1.5">
        <Chip active={!muni} onClick={() => { haptic("light"); setMuni(null); }} label={`All ${series.length}`} />
        {munis.map(([m, n]) => (
          <Chip key={m} active={muni === m} onClick={() => { haptic("light"); setMuni(muni === m ? null : m); }} label={`${m} ${n}`} />
        ))}
        <Chip
          active={recurringOnly}
          onClick={() => { haptic("light"); setRecurringOnly((v) => !v); }}
          label="↻ Recurring"
          accent="var(--app-brand)"
        />
      </div>

      <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
        {filtered.length === 0
          ? "No matches — try a different word or municipality."
          : `${filtered.length.toLocaleString()} programs${filtered.length > 50 ? " · showing first 50" : ""}`}
      </p>

      <ul className="space-y-2">
        {shown.map((s) => (
          <li key={s.key}><SeriesCard series={s} /></li>
        ))}
      </ul>
    </section>
  );
}

function Chip({
  active, onClick, label, accent,
}: { active: boolean; onClick: () => void; label: string; accent?: string }) {
  const c = accent ?? "var(--app-cool)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97]"
      style={{
        background: active ? c : "var(--app-bg-elevated)",
        color: active ? "white" : "var(--app-ink-2)",
        borderColor: active ? c : "var(--app-border)",
      }}
    >
      {label}
    </button>
  );
}
