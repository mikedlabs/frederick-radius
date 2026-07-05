"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * GlanceLedger — the "at a glance" instrument shared by /pulse and /today.
 *
 * A tabular readout of a place's live state: each row is a label, a value,
 * and a small state dot; rows that carry a `detail` expand IN PLACE on tap
 * (an accordion), so the summary and the depth live in one calm surface
 * instead of a modal or a scroll-to-section. This is the editorial register
 * the owner signed off on: typography and hairlines do the work, no gauges,
 * no glow.
 *
 * Accessibility: each expandable row is a real <button> with aria-expanded
 * and aria-controls pointing at its panel; the panel is a labelled region
 * and is `inert` while closed, so its links never take focus off-screen.
 * Non-expandable rows render as a plain row (no button), so a screen reader
 * never announces a control that does nothing.
 *
 * Motion: the open/close uses the grid-template-rows 0fr↔1fr technique (no
 * height measuring), disabled under prefers-reduced-motion via the shared
 * `.reduce-motion-safe` transition guard in globals.
 */

export type GlanceTone = "alert" | "watch" | "cool" | "calm" | "neutral";

export type GlanceRow = {
  key: string;
  label: string;
  /** The at-a-glance datum. String or a small node (e.g. a Sparkline). */
  value: ReactNode;
  tone?: GlanceTone;
  /** When present, the row becomes tappable and reveals this below itself. */
  detail?: ReactNode;
};

const DOT: Record<GlanceTone, string> = {
  alert: "var(--app-danger)",
  watch: "var(--app-warning)",
  cool: "var(--app-cool)",
  calm: "var(--app-positive)",
  neutral: "var(--app-ink-3)",
};

// Alert / watch values carry their tone so the number reads urgent at a
// glance; everything else stays quiet ink.
const VALUE_COLOR: Partial<Record<GlanceTone, string>> = {
  alert: "var(--app-danger)",
  watch: "var(--app-warning)",
};

export default function GlanceLedger({
  rows,
  /** Allow several rows open at once. Default is accordion (one at a time). */
  multi = false,
  className = "",
  style,
}: {
  rows: GlanceRow[];
  multi?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const baseId = useId();

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(multi ? prev : []);
      if (prev.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div
      className={className}
      style={{ borderTop: "1px solid var(--app-border)", ...style }}
    >
      {rows.map((row) => {
        const tone = row.tone ?? "neutral";
        const isOpen = open.has(row.key);
        const panelId = `${baseId}-${row.key}`;
        const dot = (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: DOT[tone] }}
          />
        );
        const valueEl = (
          <span
            className="text-right font-mono text-[13px] tabular-nums tracking-tight"
            style={{ color: VALUE_COLOR[tone] ?? "var(--app-ink-2)" }}
          >
            {row.value}
          </span>
        );

        if (!row.detail) {
          // Static row — no control, just a labelled readout.
          return (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_auto] items-baseline gap-3 px-0.5 py-3"
              style={{ borderBottom: "1px solid var(--app-border)" }}
            >
              <span className="flex items-center gap-2.5 text-[13.5px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {dot}
                {row.label}
              </span>
              {valueEl}
            </div>
          );
        }

        return (
          <div key={row.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
            <button
              type="button"
              onClick={() => toggle(row.key)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="tap-44 grid w-full grid-cols-[1fr_auto_16px] items-baseline gap-3 px-0.5 py-3 text-left transition-colors"
            >
              <span className="flex items-center gap-2.5 text-[13.5px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {dot}
                {row.label}
              </span>
              {valueEl}
              <ChevronRight
                aria-hidden
                className="h-4 w-4 justify-self-end transition-transform duration-300"
                style={{
                  color: "var(--app-ink-3)",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {/* grid-rows 0fr↔1fr reveals with no height measuring. The inner
                wrapper clips the content while collapsed. */}
            <div
              id={panelId}
              role="region"
              aria-label={row.label}
              inert={!isOpen}
              className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="pb-3.5 pl-[26px] pr-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {row.detail}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
