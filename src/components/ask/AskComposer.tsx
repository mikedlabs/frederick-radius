import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, Square } from "lucide-react";
import RippleMark from "@/components/brand/RippleMark";

export const ASK_COMPOSER_INPUT_CLASS =
  "min-w-0 flex-1 resize-none bg-transparent text-[16px] leading-[1.45] outline-none placeholder:text-[var(--app-ink-3)]";

/**
 * Shared visual contract for every Ask Radius entry point.
 *
 * The surrounding form still owns navigation or client-side submission, but
 * the mark, boundary, focus treatment, and primary action stay consistent.
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
      className={`ask-composer overflow-hidden rounded-[20px] bg-[var(--app-bg-elevated-solid)] ${
        compact ? "p-1.5" : "p-2"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function AskComposerMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 34 : 40;
  return (
    <span
      data-ask-composer-mark
      className="grid shrink-0 place-items-center"
      aria-hidden
    >
      <RippleMark size={size} tile detail="compact" />
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
      className={`ask-composer-submit tap-44 inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition active:scale-[0.97] disabled:opacity-35 ${className}`}
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
