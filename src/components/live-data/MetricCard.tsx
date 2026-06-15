import { type ReactNode } from "react";
import Sparkline from "./Sparkline";

/**
 * MetricCard — the reusable building block for live-data dashboards.
 *
 * One card = one observation point with a hero number, a unit, a
 * 24h trend sparkline, a label, a timestamp, and an optional accent
 * color tied to the metric. Inspired by the iOS app references in
 * the design batch (Airbnb / Klarna / Me+): one big number, a glance
 * line, photo or chart on top, status pill in the corner.
 *
 * This component is metric-agnostic. The /rivers dashboard renders
 * one per gauge; future surfaces can render one per AQI station,
 * one per traffic camera count, etc. Keep the prop set narrow —
 * if a dashboard needs more, fork from this rather than overloading.
 *
 * Pure server component.
 */

export default function MetricCard({
  eyebrow,
  title,
  subtitle,
  value,
  unit,
  trend,
  trendStroke = "var(--app-cool)",
  accent = "var(--app-cool)",
  status,
  meta,
  footer,
  href,
}: {
  /** Small all-caps line above the title, e.g. "MONOCACY RIVER". */
  eyebrow?: string;
  /** Primary identifier, e.g. "At Jug Bridge". */
  title: string;
  /** One-line context under the title, e.g. "Frederick · USGS gauge". */
  subtitle?: string;
  /** Hero number — string so the caller controls formatting (5.84). */
  value: string;
  /** Unit suffix shown next to the value, e.g. "ft". */
  unit?: string;
  /** Time-series for the sparkline. Empty / undefined hides it. */
  trend?: number[];
  /** Color for the sparkline line + fill. */
  trendStroke?: string;
  /** Color for the top accent bar + chip backgrounds. */
  accent?: string;
  /** Optional status pill text bottom-left of the card. */
  status?: { label: string; tone?: "neutral" | "good" | "warning" | "danger" };
  /** Small metadata under the value, e.g. "Updated 3 min ago". */
  meta?: ReactNode;
  /** Optional row below the body — e.g. secondary stats or a button. */
  footer?: ReactNode;
  /** Optional outbound URL — entire card becomes a link. */
  href?: string;
}) {
  const statusColor =
    status?.tone === "good"
      ? "var(--app-positive)"
      : status?.tone === "warning"
        ? "var(--app-warning)"
        : status?.tone === "danger"
          ? "var(--app-danger)"
          : "var(--app-ink-3)";

  const body = (
    <>
      {/* Top accent stripe, the metric-family identity color. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent, opacity: 0.85 }}
      />
      <div className="space-y-2.5 p-4">
        {eyebrow && (
          <p
            className="text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            {eyebrow}
          </p>
        )}
        <div className="space-y-0.5">
          <h3
            className="font-serif text-[18px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Hero number + sparkline on the same row. The number takes
            the lead; the sparkline rides alongside as the trend
            companion (same row keeps the card compact). */}
        <div className="flex items-end gap-3">
          <p className="flex items-baseline gap-1.5">
            <span
              className="font-serif text-[34px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {value}
            </span>
            {unit && (
              <span
                className="font-mono text-[12px] font-semibold"
                style={{ color: "var(--app-ink-3)" }}
              >
                {unit}
              </span>
            )}
          </p>
          {trend && trend.length >= 2 && (
            <span
              className="ml-auto flex-1"
              style={{ color: trendStroke, maxWidth: 130 }}
            >
              <Sparkline values={trend} width={130} height={36} />
            </span>
          )}
        </div>

        {meta && (
          <p
            className="font-mono text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {meta}
          </p>
        )}

        {footer && <div className="pt-1">{footer}</div>}

        {status && (
          <span
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
              color: statusColor,
            }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: statusColor }}
            />
            {status.label}
          </span>
        )}
      </div>
    </>
  );

  const className =
    "relative block overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.99]";
  const style = {
    borderColor: "var(--app-border)",
  };

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className={className}
        style={style}
      >
        {body}
      </a>
    );
  }
  return (
    <article className={className} style={style}>
      {body}
    </article>
  );
}
