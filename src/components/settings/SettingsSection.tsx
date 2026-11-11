import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * Settings layout pieces for the plain tool direction.
 *
 * A section is a 13px uppercase label followed by ruled rows on the page
 * ground: a hairline above the first row, between rows and below the last.
 * There is no bordered or filled box, no lift and no tinted icon tile. Each
 * row puts its label and helper text at the left and its value, switch,
 * chevron or action at the right.
 *
 * Sizes are in rem so the rows grow with enlarged text.
 */

/** 17px weight 600 row title. */
export const ROW_TITLE = "text-[1.0625rem] font-semibold leading-snug";
/** 14px muted helper or meta line. */
export const ROW_HELP = "text-[0.875rem] leading-relaxed";
/** 13px uppercase label, used for section labels and sub-group legends. */
export const SECTION_LABEL =
  "text-[0.8125rem] font-semibold uppercase leading-tight tracking-[0.09em]";

export const inkStyle: CSSProperties = { color: "var(--app-ink)" };
export const helpStyle: CSSProperties = { color: "var(--app-ink-3)" };

export function SettingsSection({
  title,
  ariaLabel,
  id,
  style,
  children,
}: {
  title: ReactNode;
  /** Keeps an existing landmark name when it differs from the visible label. */
  ariaLabel?: string;
  id?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : headingId}
      style={style}
    >
      <h2
        id={headingId}
        className={`${SECTION_LABEL} mb-2`}
        style={{ color: "var(--app-ink-2)" }}
      >
        {title}
      </h2>
      <SettingsRows>{children}</SettingsRows>
    </section>
  );
}

/** The ruled run of rows under a section label. */
export function SettingsRows({ children }: { children: ReactNode }) {
  return (
    <div
      data-settings-rows
      className="divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]"
    >
      {children}
    </div>
  );
}

/**
 * One ruled row. `trailing` sits at the right and wraps below the text on
 * narrow screens or with enlarged text instead of squeezing it.
 */
export function SettingsRow({
  children,
  trailing,
  className = "",
}: {
  children?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-settings-row
      className={`flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 ${className}`.trim()}
    >
      {children !== undefined ? (
        <div className="min-w-0 flex-[1_1_12rem]">{children}</div>
      ) : null}
      {trailing !== undefined ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/**
 * The device-local on/off switch. A switch is one of the few controls that
 * keeps a full capsule. The off track uses the control border token so the
 * state reads at 3:1 against the ground in both appearances.
 */
export function SettingsSwitch({
  checked,
  label,
  disabled = false,
  onClick,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-settings-switch
      className="tap-44 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none disabled:opacity-45"
      style={{
        background: checked ? "var(--app-brand)" : "var(--app-control-border)",
      }}
    >
      <span
        aria-hidden
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform motion-reduce:transition-none"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

/**
 * Style for a 6px bordered toggle button (interests, home area, appearance).
 * The selected state is an ink fill, never coral.
 */
export function toggleStyle(on: boolean): CSSProperties {
  return on
    ? {
        borderColor: "var(--app-ink)",
        background: "var(--app-ink)",
        color: "var(--app-bg)",
      }
    : {
        borderColor: "var(--app-control-border)",
        background: "var(--app-bg)",
        color: "var(--app-ink)",
      };
}

export const TOGGLE_CLASS =
  "flex min-h-11 w-full items-center gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2 text-left text-[0.9375rem] font-semibold leading-snug transition-colors motion-reduce:transition-none";
