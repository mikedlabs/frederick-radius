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
 * Placement mirrors the app's other bottom chrome:
 *   - `lg:hidden` — desktop keeps the inline action grids untouched and
 *     the SideRail owns the left edge, so a bottom dock would be wrong.
 *   - It REPLACES BottomNav on detail routes instead of stacking above it.
 *     The bar therefore owns the same bottom edge and safe-area clearance as
 *     the primary nav.
 *   - A centered rounded card, not an edge-to-edge slab, to match the
 *     floating-pill language of BottomNav / FeedbackWidget.
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
      className="fixed inset-x-0 bottom-0 lg:hidden"
      style={{
        zIndex: "var(--z-nav)",
        // PLAIN TOOL: a flat bar attached to the bottom edge, white with a
        // top hairline, in the same position the tab bar occupies.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        background: "var(--app-bg)",
        borderTop: "1px solid var(--app-border)",
      }}
    >
      <div
        role="toolbar"
        aria-label={ariaLabel}
        className="mx-auto flex max-w-screen-md items-stretch gap-2 px-3 py-2"
      >
        {children}
      </div>
    </div>
  );
}

const CELL_BASE =
  "flex items-center justify-center rounded-[var(--app-radius-md)] px-2 py-1.5 font-semibold leading-none min-h-[48px] tap-44";
// The one filled action reads as a button (icon beside its label); the
// others are quiet stacked text actions.
const CELL_PRIMARY = `${CELL_BASE} flex-[1.4] flex-row gap-2 text-[14px]`;
const CELL = `${CELL_BASE} flex-1 flex-col gap-1 text-[11px]`;

/**
 * Shared cell chrome so a link cell (MobileBarLink) and a reused control
 * (EventCalendarButton in bar mode) look identical. Exported so the
 * calendar button can style itself as a bar cell without duplicating this.
 */
export function barCellClass(primary?: boolean): string {
  return primary ? CELL_PRIMARY : `${CELL} transition-colors hover:bg-[var(--app-bg-sunken)]`;
}
export function barCellStyle(primary?: boolean): React.CSSProperties {
  return primary
    ? // brand-press, not brand: white on plain --app-brand is ~4.1:1 on the
      // 11px semibold cell label (fails AA); brand-press is ~6:1 (2026-07 P4).
      { background: "var(--app-brand-press)", color: "var(--app-on-brand)" }
    : { color: "var(--app-ink)" };
}
export function barIconStyle(primary?: boolean): React.CSSProperties {
  return { color: primary ? "var(--app-on-brand)" : "var(--app-ink)" };
}

/**
 * A link/anchor action cell (directions, call, tickets). Renders a plain
 * `<a>` — every bar link is an outbound/`tel:` target, no internal nav —
 * with one primary (vermilion) styling per bar and the rest quiet.
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
      aria-label={ariaLabel ?? label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(download ? { download: true } : {})}
      className={barCellClass(primary)}
      style={barCellStyle(primary)}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden style={barIconStyle(primary)} />
      {label}
    </a>
  );
}

/**
 * Wrapper for a reused client control (e.g. SaveButton) so it reads as a
 * bar cell — the control is the icon, `label` sits beneath it to match the
 * link cells. The control keeps its own ≥44px tap target and a11y label.
 */
export function MobileBarControl({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md)] px-2 py-1 text-[11px] font-semibold leading-none min-h-[52px]">
      {children}
      <span style={{ color: "var(--app-ink-2)" }}>{label}</span>
    </div>
  );
}
