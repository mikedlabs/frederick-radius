"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

type Props = {
  label: string;
  onClose: () => void;
  onOpenFullPage?: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  historyLayerId?: string;
};

/**
 * Immediate, dismissible feedback while a detail-sheet bundle loads.
 *
 * Place and event sheets are intentionally kept out of the persistent app
 * shell. The fallback preserves the same bottom-sheet silhouette, prevents a
 * first tap from feeling ignored, and still gives the user a way back on a
 * slow connection.
 */
export default function LazySheetFallback({
  label,
  onClose,
  onOpenFullPage,
  returnFocusRef,
  historyLayerId,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, true);

  const finishDismiss = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus?.());
  }, [onClose, returnFocusRef]);
  const historyLayer = useReversibleHistoryLayer({
    active: Boolean(historyLayerId),
    id: historyLayerId ?? "",
    onDismiss: finishDismiss,
  });
  const dismiss = historyLayer.dismiss;

  // The same page lock the real sheet takes when its chunk arrives.
  useScrollLock(true);

  useLayoutEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dismiss]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[var(--z-overlay)]"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/45"
        aria-label="Close"
        onClick={dismiss}
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[var(--app-radius-lg)] border-t bg-[var(--app-bg-elevated)] px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-[var(--app-shadow-3)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex min-h-11 items-center justify-between">
          <button
            ref={closeRef}
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center rounded-[var(--app-radius-md)] px-3 text-[12px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Close
          </button>
          <span
            aria-hidden
            className="h-1 w-10 rounded-full"
            style={{ background: "var(--app-border)" }}
          />
          <span aria-hidden className="w-[62px]" />
        </div>
        <div role="status" aria-live="polite" aria-atomic="true" className="pt-3">
          <span className="sr-only">{label}</span>
          <div
            aria-hidden
            className="h-3 w-24 animate-pulse rounded-[var(--app-radius-sm)]"
            style={{ background: "var(--app-bg-sunken)" }}
          />
          <div
            aria-hidden
            className="mt-3 h-7 w-4/5 animate-pulse rounded-[var(--app-radius-sm)]"
            style={{ background: "var(--app-bg-sunken)" }}
          />
          <div
            aria-hidden
            className="mt-5 h-4 w-1/2 animate-pulse rounded-[var(--app-radius-sm)]"
            style={{ background: "var(--app-bg-sunken)" }}
          />
          <div
            aria-hidden
            className="mt-3 h-3 w-full animate-pulse rounded-[var(--app-radius-sm)]"
            style={{ background: "var(--app-bg-sunken)" }}
          />
          <div
            aria-hidden
            className="mt-2 h-3 w-10/12 animate-pulse rounded-[var(--app-radius-sm)]"
            style={{ background: "var(--app-bg-sunken)" }}
          />
        </div>
        {onOpenFullPage ? (
          <button type="button" onClick={onOpenFullPage} className="mt-5 inline-flex min-h-11 items-center rounded-[var(--app-radius-md)] border px-4 text-sm font-semibold" style={{ color: "var(--app-ink)", background: "var(--app-bg)", borderColor: "var(--app-control-border)" }}>
            Open full page
          </button>
        ) : null}
      </div>
    </div>
  );
}
