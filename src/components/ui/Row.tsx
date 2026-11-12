import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Row and RowList: the canonical dense directory row.
 *
 * The antidote to the "directory of big cards that goes on forever"
 * problem: where PlaceCard (variant="row") is for place data with
 * photos + hours, this is the generic ~56px scannable row for the
 * other directories (parks, amenities, parking, contacts) that were
 * rendering as full-width cards (Parks was ~13 phone-screens tall).
 *
 * A RowList is a run of ruled rows on the page ground: `border-y` on the
 * list and a `border-b` hairline on each row except the last, so the list
 * is closed by one hairline above and one below and reads as a single tidy
 * block instead of a stack of separate cards. Server-component safe (no
 * hooks), so it drops straight into server pages.
 *
 * The leading slot holds a real photograph when one exists. Otherwise it
 * holds the plain glyph (IconTile): a 24px icon in ink-3 with no tile,
 * tint, border or fill.
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
      // Plain tool: ruled rows on the page ground, closed by one hairline
      // above and below. No rounded container or lift.
      className={`border-y [&>li:last-child>*]:border-b-0 ${className}`.trim()}
      style={{ borderColor: "var(--app-border)" }}
    >
      {children}
    </ul>
  );
}

type RowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small trailing fact (acres, distance, count), quiet and tabular. */
  meta?: ReactNode;
  /** Leading slot: a real thumbnail, or the plain IconTile glyph. */
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
          className="block truncate text-[17px] font-semibold leading-snug tracking-[-0.01em]"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[14px]" style={{ color: "var(--app-ink-2)" }}>
            {subtitle}
          </span>
        )}
      </span>
      {meta && (
        <span className="shrink-0 text-[13px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
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
    `flex min-h-14 w-full items-center gap-3 border-b py-3 text-left transition-colors active:bg-[var(--app-bg-sunken)] ${className}`.trim();
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

/**
 * The plain glyph for a Row's leading slot when no photograph exists: a 24px
 * icon in ink-3 with no tile, tint, border or fill. The name is kept for
 * existing callers. `tone` is accepted so they still compile, but it is
 * ignored: a category hue is not a glyph color in a plain row.
 */
export function IconTile({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
  /** Ignored. Rows draw every glyph in ink-3. */
  tone?: string;
}) {
  return (
    <span
      aria-hidden
      data-row-glyph
      className="grid h-6 w-6 place-items-center"
      style={{ color: "var(--app-ink-3)" }}
    >
      <Icon className="h-6 w-6" strokeWidth={1.8} />
    </span>
  );
}
