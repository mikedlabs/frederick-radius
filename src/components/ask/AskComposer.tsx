import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, Square } from "lucide-react";
import RippleMark from "@/components/brand/RippleMark";

export const ASK_COMPOSER_INPUT_CLASS =
  "min-w-0 flex-1 resize-none bg-transparent text-[16px] leading-[1.45] outline-none placeholder:text-[var(--app-ink-3)]";

/**
 * The text control never draws its own ring. The surrounding field takes the
 * keyboard focus ring instead, so the visible outline follows the 6px field
 * rather than a rectangle inside it. Inline style is required because the
 * global `:focus-visible` rule outranks a layered utility class.
 */
export const ASK_COMPOSER_INPUT_STYLE = {
  color: "var(--app-ink)",
  outline: "none",
} as const;

/**
 * Shared visual contract for every Ask Radius entry point.
 *
 * The surrounding form still owns navigation or client-side submission, but
 * the mark, boundary, focus treatment, and primary action stay consistent.
 * The frame is a plain 6px bordered field on the page ground: no shadow, no
 * glow, and a focus ring that appears only for keyboard focus on its text
 * control.
 */
export function AskComposerFrame({
  children,
  compact = false,
  className = "",
}: {
  children?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      data-ask-composer
      data-ask-composer-size={compact ? "compact" : "full"}
      className={`overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--app-focus)] has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-[var(--app-focus)] ${
        compact ? "p-1" : "p-1.5"
      } ${className}`}
      style={{ borderColor: "var(--app-control-border)" }}
    >
      {children}
    </div>
  );
}

/**
 * The plain compact mark marks the field as Ask without adding a second coral
 * field beside the submit action, so it draws strokes only and no tile.
 */
export function AskComposerMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 24 : 32;
  return (
    <span
      data-ask-composer-mark
      className="grid h-11 w-9 shrink-0 place-items-center"
      style={{ color: "var(--app-brand-text)" }}
      aria-hidden
    >
      <RippleMark size={size} detail="compact" />
    </span>
  );
}

export function AskComposerSubmit({
  loading = false,
  onCancel,
  className = "",
  type,
  onClick,
  "aria-label": ariaLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  onCancel?: () => void;
}) {
  return (
    <button
      type={loading ? "button" : type ?? "submit"}
      aria-label={loading ? "Cancel" : ariaLabel ?? "Ask Radius"}
      onClick={
        loading
          ? (event) => {
              // Aborting can synchronously re-render this same DOM node from
              // type="button" to type="submit" before the click's default
              // action runs. Prevent it explicitly so Stop never becomes an
              // accidental immediate retry.
              event.preventDefault();
              onCancel?.();
            }
          : onClick
      }
      className={`tap-44 inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] px-3 text-[14px] font-semibold transition-opacity active:opacity-80 disabled:opacity-35 ${className}`}
      style={{
        background: "var(--app-brand-press)",
        color: "var(--app-on-brand)",
      }}
      {...props}
    >
      <span className={loading ? "inline" : "hidden sm:inline"}>
        {loading ? "Stop" : "Ask"}
      </span>
      {loading ? (
        <Square className="h-[15px] w-[15px]" fill="currentColor" aria-hidden />
      ) : (
        <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
      )}
    </button>
  );
}
