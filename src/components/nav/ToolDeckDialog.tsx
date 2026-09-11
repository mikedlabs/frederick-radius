"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { prefersReducedMotion } from "@/lib/motion";

export type ToolDeckDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Responsive modal shell for the Tool Deck.
 *
 * One portal-backed dialog changes shape at the same `lg` breakpoint as the
 * app navigation: a bottom sheet below it and a right-side panel above it.
 * Keeping one DOM tree prevents duplicate focus targets and accessible IDs.
 */
export default function ToolDeckDialog({
  open,
  title,
  description,
  onClose,
  children,
}: ToolDeckDialogProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(panelRef, open && mounted);

  useEffect(() => {
    let frame = 0;
    let timer = 0;

    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- presence must mount before the entrance transform can run
      setMounted(true);
      frame = window.requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
      timer = window.setTimeout(
        () => setMounted(false),
        prefersReducedMotion() ? 0 : 240,
      );
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (!target?.isConnected) return;
      window.requestAnimationFrame(() => target.focus?.());
    };
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    const frame = window.requestAnimationFrame(() => {
      (closeRef.current ?? panelRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mounted, open]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[var(--z-overlay)] ${
        open ? "" : "pointer-events-none"
      }`}
      data-tool-deck-dialog
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-[var(--app-dur-med)] ease-[var(--app-ease-out)] motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`absolute inset-x-0 bottom-0 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--app-radius-xl)] border-t bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-shadow-3)] outline-none transition-transform duration-[var(--app-dur-med)] ease-[var(--app-ease-out)] motion-reduce:transition-none lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[30rem] lg:max-w-[calc(100vw-6rem)] lg:rounded-l-[var(--app-radius-xl)] lg:rounded-tr-none lg:border-l lg:border-t-0 ${
          entered
            ? "translate-y-0 lg:translate-x-0"
            : "translate-y-full lg:translate-x-full lg:translate-y-0"
        }`}
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full lg:hidden"
          style={{ background: "var(--app-border-strong)" }}
        />

        <header
          className="flex shrink-0 items-start gap-3 border-b pb-3 pt-3"
          style={{
            borderColor: "var(--app-border)",
            paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-sans text-[20px] font-semibold leading-tight tracking-[-0.02em]"
              style={{ color: "var(--app-ink)" }}
            >
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-[12px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border transition active:scale-95"
            style={{
              borderColor: "var(--app-control-border)",
              background: "var(--app-bg-elevated-solid)",
              color: "var(--app-ink-2)",
            }}
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
            paddingBottom:
              "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
