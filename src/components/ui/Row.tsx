import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Row + RowList — the canonical DENSE directory row (Visual System v2).
 *
 * The antidote to the "directory of big cards that goes on forever"
 * problem: where PlaceCard (variant="row") is for place data with
 * photos + hours, this is the generic ~56px scannable row for the
 * other directories — parks, amenities, parking, contacts — that were
 * rendering as full-width cards (Parks was ~13 phone-screens tall).
 *
 * A RowList is one elevated, rounded container with hairline dividers
 * between rows (the established "compact list" look), so a long list
 * reads as a single tidy block instead of a stack of separate cards.
 * Server-component safe (no hooks) — drops straight into server pages.
 *
 *   <RowList>
 *     {parks.map((p) => (
 *       <Row key={p.id} href={`/map?at=${p.lat},${p.lng}`}
 *            leading={<IconTile icon={Trees} />}
 *            title={p.name} subtitle={p.address} meta={`${p.acres} ac`} />
 *     ))}
 *   </RowList>
 */

export function RowList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={`overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] [&>li:last-child>*]:border-b-0 ${className}`.trim()}
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      {children}
    </ul>
  );
}

type RowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small trailing fact (acres, distance, count) — quiet, tabular. */
  meta?: ReactNode;
  /** Leading slot — an IconTile, a tiny thumbnail, etc. */
  leading?: ReactNode;
  /** Trailing slot. Defaults to a chevron (internal) / external glyph. */
  trailing?: ReactNode;
  href?: string;
  /** External link → new tab + external glyph. */
  external?: boolean;
  className?: string;
  style?: CSSProperties;
};

function RowInner({ title, subtitle, meta, leading, trailing, href, external }: RowProps) {
  return (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[14px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            {subtitle}
          </span>
        )}
      </span>
      {meta && (
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {meta}
        </span>
      )}
      {trailing ??
        (href ? (
          external ? (
            <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          )
        ) : null)}
    </>
  );
}

export function Row(props: RowProps) {
  const { href, external, className = "", style } = props;
  const cls =
    `flex w-full items-center gap-3 border-b px-3.5 py-2.5 text-left transition active:bg-[var(--app-bg-sunken)] ${className}`.trim();
  const merged: CSSProperties = { borderColor: "var(--app-border)", ...style };

  if (href) {
    return (
      <li>
        {external ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={merged}>
            <RowInner {...props} />
          </a>
        ) : (
          <Link href={href} className={cls} style={merged}>
            <RowInner {...props} />
          </Link>
        )}
      </li>
    );
  }
  return (
    <li className={cls} style={merged}>
      <RowInner {...props} />
    </li>
  );
}

/** Small rounded icon tile for a Row's leading slot. */
export function IconTile({
  icon: Icon,
  tone = "var(--app-ink-3)",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
  tone?: string;
}) {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 place-items-center rounded-full"
      style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
    >
      <Icon className="h-4 w-4" strokeWidth={2} style={{ color: tone }} />
    </span>
  );
}
