import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { DecisionAction } from "@/lib/decision/telemetry";

/**
 * MobileActionBar — the thumb-reachable primary-action dock for the
 * place- and event-detail pages.
 *
 * On phones the key actions (save, directions, call, tickets, add to
 * calendar) were buried inline in a long scroll; on a place or event you
 * open to act, the answer to "how do I get there / keep this / buy in"
 * should be one thumb-reach away. This pins them to the bottom of the
 * viewport as a compact floating card.
 *
 * Placement and shape:
 *   - `lg:hidden` — desktop keeps the inline action grids untouched and
 *     the SideRail owns the left edge, so a bottom dock would be wrong.
 *   - It REPLACES BottomNav on detail routes instead of stacking above it.
 *     The bar therefore owns the same bottom edge and safe-area clearance as
 *     the primary nav.
 *   - A full-width solid bar with one 1px top rule, deliberately NOT the
 *     floating rounded card of the tab dock. The old card read as the
 *     navigation, so a detail page looked like it had swapped tabs.
 *   - One wide primary action (48px, brand-press fill, glyph plus label);
 *     every other action is a 48px outlined square named by its
 *     accessible label. The primary leads visually wherever it sits in
 *     the markup.
 *
 * The bar stays presentational (no hooks) so it can render inside the server
 * page and simply pass client controls (SaveButton, EventCalendarButton)
 * through as children. BottomNav responds to the rendered
 * `data-mobile-action-bar` marker, so future surfaces get the replacement
 * behavior by adopting this component rather than updating a route allowlist.
 */
/** The contextual bar deliberately fits inside the shell's existing 84px
 * mobile-bottom-chrome reserve. On desktop that token resolves to 0px because
 * both BottomNav and this bar are hidden. */
export const MOBILE_BOTTOM_CHROME_RESERVE =
  "var(--app-bottomnav-reserve, 84px)";

export function MobileActionBar({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <div
      data-mobile-action-bar
      data-app-action-bar
      className="fixed inset-x-0 bottom-0 border-t lg:hidden"
      style={{
        zIndex: "var(--z-nav)",
        background: "var(--app-bg-elevated-solid)",
        borderColor: "var(--app-border)",
        paddingTop: "8px",
        // BottomNav is suppressed on these routes, so this bar owns the
        // ordinary mobile-chrome edge instead of forming a second tier.
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        // On a notched phone in landscape the side insets aren't 0; keep
        // the actions off the notch while holding the 0.75rem base.
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <div
        role="toolbar"
        aria-label={ariaLabel}
        className="mx-auto flex max-w-screen-md items-center gap-2"
      >
        {children}
      </div>
    </div>
  );
}

const CELL_PRIMARY =
  "order-first flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-3 text-[15px] font-semibold leading-none tactile-glow-brand";
const CELL_QUIET =
  "grid h-12 w-12 shrink-0 place-items-center rounded-[var(--app-radius-md)] border transition-colors hover:bg-[var(--app-bg-sunken)]";

/**
 * Shared cell chrome so a link cell (MobileBarLink) and a reused control
 * (EventCalendarButton, SaveButton in bar mode) look identical. Exported so
 * those controls can style themselves as bar cells without duplicating this.
 */
export function barCellClass(primary?: boolean): string {
  return primary ? CELL_PRIMARY : CELL_QUIET;
}
export function barCellStyle(primary?: boolean): React.CSSProperties {
  return primary
    ? // brand-press, not brand: white on plain --app-brand fails AA for the
      // label; brand-press clears it (2026-07 P4).
      { background: "var(--app-brand-press)", color: "var(--app-on-brand)" }
    : {
        background: "var(--app-bg-elevated-solid)",
        borderColor: "var(--app-border)",
        color: "var(--app-ink-2)",
      };
}
export function barIconStyle(primary?: boolean): React.CSSProperties {
  return { color: primary ? "var(--app-on-brand)" : "var(--app-ink-2)" };
}
/** The primary shows its words; a square keeps them for assistive tech. */
export function barLabelClass(primary?: boolean): string {
  return primary ? "truncate" : "sr-only";
}

/**
 * A link/anchor action cell (directions, call, tickets). Renders a plain
 * `<a>` — every bar link is an outbound/`tel:` target, no internal nav —
 * with one primary (brand-press) action per bar and the rest quiet squares.
 */
export function MobileBarLink({
  href,
  icon: Icon,
  label,
  primary,
  external,
  download,
  ariaLabel,
  decisionAction,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  external?: boolean;
  download?: boolean;
  ariaLabel?: string;
  decisionAction?: DecisionAction;
}) {
  return (
    <a
      href={href}
      data-decision-action={decisionAction}
      data-bar-primary={primary ? "true" : undefined}
      aria-label={ariaLabel ?? label}
      title={primary ? undefined : label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(download ? { download: true } : {})}
      className={barCellClass(primary)}
      style={barCellStyle(primary)}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden style={barIconStyle(primary)} />
      <span className={barLabelClass(primary)}>{label}</span>
    </a>
  );
}
