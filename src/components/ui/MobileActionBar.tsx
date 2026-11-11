import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { DecisionAction } from "@/lib/decision/telemetry";

/**
 * MobileActionBar: the thumb-reachable primary-action bar for the place- and
 * event-detail pages.
 *
 * On phones the key actions (directions, call, tickets, add to calendar) were
 * buried inline in a long scroll; on a place or event you open to act, the
 * answer to "how do I get there or buy in" should be one thumb-reach away.
 * This pins them to the bottom of the viewport.
 *
 * Placement mirrors the app's other bottom chrome:
 *   - `lg:hidden`: desktop keeps the inline action grids untouched and the
 *     SideRail owns the left edge, so a bottom bar would be wrong.
 *   - It REPLACES BottomNav on detail routes instead of stacking above it.
 *     The bar therefore owns the same bottom edge and safe-area clearance as
 *     the primary nav.
 *   - PLAIN TOOL: a flat bar attached to the screen's bottom edge, the page
 *     ground with one top hairline. No floating offset, card, radius or
 *     shadow. Its height (4px + a 48px cell row + 4px + the 1px hairline)
 *     equals the shared `--app-bottomnav-reserve`, so toasts and the feedback
 *     trigger clear it exactly as they clear the tab bar.
 *   - The reading column reserves more than that height plus the bottom safe
 *     area (`.app-main-reading[data-bottom-nav-reserve="true"]`), so the bar
 *     never covers the last content of the page.
 *
 * The bar stays presentational (no hooks) so it can render inside the server
 * page and simply pass client controls (SaveButton, EventCalendarButton)
 * through as children. BottomNav responds to the rendered
 * `data-mobile-action-bar` marker, so future surfaces get the replacement
 * behavior by adopting this component rather than updating a route allowlist.
 */
/** The contextual bar fits inside the shell's mobile-bottom-chrome reserve.
 * On desktop that token resolves to 0px because both BottomNav and this bar
 * are hidden. */
export const MOBILE_BOTTOM_CHROME_RESERVE =
  "var(--app-bottomnav-reserve, 84px)";

/** Bar content height without the bottom safe area: 4px padding, a 48px cell
 * row, 4px padding and the 1px top hairline. Kept equal to the 57px
 * `--app-bottomnav-reserve` so the two bottom bars share one clearance. */
export const MOBILE_ACTION_BAR_HEIGHT_PX = 57;

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
        // Attached to the bottom edge, in the position the tab bar occupies.
        // Each side keeps clear of its own safe-area inset.
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
        className="mx-auto flex max-w-screen-md items-stretch gap-2 px-3 py-1 max-[359px]:gap-1.5"
      >
        {children}
      </div>
    </div>
  );
}

// Cells keep their content's minimum width (no min-w-0), so a label is never
// clipped: the quiet cells give up space before the filled one does.
const CELL_BASE =
  "flex min-h-12 items-center justify-center rounded-[var(--app-radius-md)] font-semibold leading-none tap-44";
// The one filled action reads as a button (icon beside its label); the
// others are quiet stacked text actions in ink.
const CELL_PRIMARY = `${CELL_BASE} flex-[1.4] flex-row gap-2 px-2 text-[15px] max-[359px]:gap-1.5 max-[359px]:text-[14px]`;
const CELL = `${CELL_BASE} flex-1 flex-col gap-1 px-1 text-[12px]`;

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
      // semibold cell label (fails AA); brand-press is ~6:1 (2026-07 P4).
      { background: "var(--app-brand-press)", color: "var(--app-on-brand)" }
    : { color: "var(--app-ink)" };
}
export function barIconStyle(primary?: boolean): React.CSSProperties {
  return { color: primary ? "var(--app-on-brand)" : "var(--app-ink)" };
}

/**
 * A link/anchor action cell (directions, call, tickets). Renders a plain
 * `<a>` (every bar link is an outbound or `tel:` target, no internal nav)
 * with one primary filled coral cell per bar and the rest quiet.
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
      <Icon className={primary ? "h-[18px] w-[18px] shrink-0" : "h-5 w-5 shrink-0"} strokeWidth={1.75} aria-hidden style={barIconStyle(primary)} />
      <span className="whitespace-nowrap">{label}</span>
    </a>
  );
}

/**
 * Wrapper for a reused client control (e.g. SaveButton) so it reads as a
 * bar cell: the control is the icon, `label` sits beneath it to match the
 * link cells. The control keeps its own 44px tap target and a11y label.
 */
export function MobileBarControl({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md)] px-2 text-[12px] font-semibold leading-none">
      {children}
      <span style={{ color: "var(--app-ink)" }}>{label}</span>
    </div>
  );
}
