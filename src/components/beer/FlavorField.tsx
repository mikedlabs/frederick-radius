"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { StyleFamily } from "@/data/beers";
import {
  buildFieldRows,
  abvFraction,
  RIDGE_H,
  FIELD_ABV_BANDS,
  FLAVOR_INSIGHTS,
  type FlavorInsight,
} from "@/lib/beer/flavor-field";

/**
 * The Flavor Field — the whole county's palate on one screen, and the primary
 * filter control for the board below. Nine family rows (sorted by count), each
 * beer a dot placed by ABV; tapping a row filters to that family, tapping an
 * ABV band shades that strength column, tapping an insight applies its filter.
 *
 * Presentation only: the parent (BeerIndex) owns the BeerFilter and passes the
 * active families + band and the handlers, so the chart and the pour list can
 * never disagree. Dots are aria-hidden decoration; the row button carries the
 * accessible label and does the filtering.
 */

const ROW_H = 44; // px per family row

export type FlavorFieldProps = {
  families: StyleFamily[];
  activeBandKey: string | null;
  onToggleFamily: (key: StyleFamily) => void;
  onToggleBand: (band: (typeof FIELD_ABV_BANDS)[number]) => void;
  onApplyInsight: (insight: FlavorInsight) => void;
  onClear: () => void;
  active: boolean;
};

export default function FlavorField({
  families,
  activeBandKey,
  onToggleFamily,
  onToggleBand,
  onApplyInsight,
  onClear,
  active,
}: FlavorFieldProps) {
  const rows = useMemo(() => buildFieldRows(), []);
  const [insightIdx, setInsightIdx] = useState(0);
  const insight = FLAVOR_INSIGHTS[insightIdx];

  const familySelected = families.length > 0;
  const band = FIELD_ABV_BANDS.find((b) => b.key === activeBandKey);
  // The shaded band column, as left/width fractions of the dot strip.
  const bandSpan = band
    ? {
        left: band.min == null ? 0 : abvFraction(band.min),
        right: band.max == null ? 1 : abvFraction(band.max),
      }
    : null;

  return (
    <section aria-label="Flavor field: the county's beers by style and strength" className="text-[#281e14]">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#85501f]">The flavor field</p>
          <h2 className="mt-1 font-serif text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            Every pour, by style and strength
          </h2>
        </div>
        {active && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 pb-0.5 text-[12px] font-semibold text-[#a33a1e]"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Clear
          </button>
        )}
      </div>

      {/* The chart: one row per family, dots placed by ABV. */}
      <div className="mt-3 overflow-hidden rounded-[14px] border border-black/12 bg-[#faf5ea]">
        {rows.map((row) => {
          const on = families.includes(row.key);
          const dim = familySelected && !on;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onToggleFamily(row.key)}
              aria-pressed={on}
              aria-label={`${row.label}, ${row.count} beers, filter`}
              className="flex w-full items-stretch border-b border-black/8 text-left transition-colors last:border-b-0 hover:bg-[#f2e9d8]"
              style={{ opacity: dim ? 0.34 : 1 }}
            >
              {/* Label + count, left */}
              <span
                className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-black/8 px-2.5"
                style={{ width: 132, minHeight: ROW_H }}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.base, boxShadow: on ? `0 0 0 2px ${row.deep}` : "none" }} />
                  <span className="truncate text-[12px] font-semibold leading-tight" style={{ color: on ? row.deep : "#281e14" }}>{row.label}</span>
                </span>
                <span className="pl-4 font-mono text-[10px] tabular-nums text-[#6b5a45]">{row.count}</span>
              </span>
              {/* Ridgeline — the family's ABV distribution as a filled hill. */}
              <span className="relative flex-1" style={{ minHeight: ROW_H }} aria-hidden>
                {bandSpan && (
                  <span
                    className="absolute inset-y-0 z-10"
                    style={{
                      left: `${bandSpan.left * 100}%`,
                      width: `${(bandSpan.right - bandSpan.left) * 100}%`,
                      background: "rgba(94,58,21,0.10)",
                      borderLeft: "1px solid rgba(94,58,21,0.28)",
                      borderRight: "1px solid rgba(94,58,21,0.28)",
                    }}
                  />
                )}
                <svg
                  viewBox={`0 0 100 ${RIDGE_H}`}
                  preserveAspectRatio="none"
                  width="100%"
                  height={ROW_H}
                  className="block"
                  aria-hidden
                >
                  <defs>
                    <linearGradient id={`ridge-${row.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={row.base} stopOpacity={on ? 0.95 : 0.82} />
                      <stop offset="100%" stopColor={row.deep} stopOpacity={0.45} />
                    </linearGradient>
                  </defs>
                  <path d={row.ridge.area} fill={`url(#ridge-${row.key})`} />
                  <path
                    d={row.ridge.line}
                    fill="none"
                    stroke={row.deep}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </span>
            </button>
          );
        })}
      </div>

      {/* ABV axis + band buttons */}
      <div className="mt-2 flex" aria-hidden>
        <span className="shrink-0" style={{ width: 132 }} />
        <div className="flex flex-1 justify-between px-1 font-mono text-[9px] tabular-nums text-black/40">
          <span>3%</span>
          <span>5%</span>
          <span>7%</span>
          <span>9%</span>
          <span>12%+</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 px-0.5">
        {FIELD_ABV_BANDS.map((b) => {
          const on = activeBandKey === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onToggleBand(b)}
              aria-pressed={on}
              className={`min-h-9 rounded-full px-3 text-[12px] font-semibold transition ${
                on ? "bg-[#5e3a15] text-[#fffaf2]" : "border border-black/15 bg-[#faf5ea] text-black/62"
              }`}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      {/* One data-derived insight, tappable to apply its filter; dots page it. */}
      <div className="mt-3 rounded-[12px] border border-black/10 bg-[#f3ecdd] px-3.5 py-3">
        <button
          type="button"
          onClick={() => onApplyInsight(insight)}
          className="block w-full text-left text-[12.5px] font-medium leading-relaxed text-[#3a2a17]"
        >
          {insight.text}
        </button>
        <div className="mt-2 flex items-center gap-1.5">
          {FLAVOR_INSIGHTS.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setInsightIdx(i)}
              aria-label={`Insight ${i + 1} of ${FLAVOR_INSIGHTS.length}`}
              aria-current={i === insightIdx}
              className="grid h-6 w-6 place-items-center"
            >
              <span
                className="h-1.5 w-1.5 rounded-full transition"
                style={{ background: i === insightIdx ? "#85501f" : "rgba(94,58,21,0.28)" }}
              />
            </button>
          ))}
          <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b5a45]">Tap to filter</span>
        </div>
      </div>
    </section>
  );
}
