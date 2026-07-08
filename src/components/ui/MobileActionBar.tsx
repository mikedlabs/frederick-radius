import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
 *   - Lifted `76px` above the safe-area inset so it clears the floating
 *     BottomNav pill (same clearance FeedbackWidget uses) and the iPhone
 *     home indicator.
 *   - A centered rounded card, not an edge-to-edge slab, to match the
 *     floating-pill language of BottomNav / FeedbackWidget.
 *
 * The bar is presentational (no hooks) so it can render inside the server
 * page and simply pass client controls (SaveButton, EventCalendarButton)
 * through as children.
 */
export function MobileActionBar({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 lg:hidden"
      style={{
        zIndex: "var(--z-nav)",
        // Sit above the BottomNav pill (which itself clears the home
        // indicator). 76px matches FeedbackWidget's nav clearance.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
        // On a notched phone in landscape the side insets aren't 0; keep
        // the card off the notch while holding the 0.75rem base in portrait.
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <div
        role="toolbar"
        aria-label={ariaLabel}
        className="pointer-events-auto mx-auto flex max-w-screen-md items-stretch gap-1.5 rounded-[var(--app-radius-lg)] border p-1.5"
        style={{
          background: "var(--app-bg-elevated-solid)",
          borderColor: "var(--app-border)",
          boxShadow:
            "0 10px 28px -8px rgba(20,20,18,0.22), 0 2px 6px rgba(20,20,18,0.10), var(--app-edge), var(--app-hi)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const CELL =
  "flex flex-1 flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] px-2 py-2 text-[11px] font-semibold leading-none min-h-[52px] tap-44";

/**
 * Shared cell chrome so a link cell (MobileBarLink) and a reused control
 * (EventCalendarButton in bar mode) look identical. Exported so the
 * calendar button can style itself as a bar cell without duplicating this.
 */
export function barCellClass(primary?: boolean): string {
  return primary ? `${CELL} tactile-glow-brand` : `${CELL} transition-colors hover:bg-[var(--app-bg-sunken)]`;
}
export function barCellStyle(primary?: boolean): React.CSSProperties {
  return primary
    ? { background: "var(--app-brand)", color: "var(--app-on-brand)" }
    : { color: "var(--app-ink-2)" };
}
export function barIconStyle(primary?: boolean): React.CSSProperties {
  return { color: primary ? "var(--app-on-brand)" : "var(--app-brand-press)" };
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
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  external?: boolean;
  download?: boolean;
  ariaLabel?: string;
}) {
  return (
    <a
      href={href}
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
