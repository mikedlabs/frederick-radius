"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { takeMapSelectionOpener } from "./mapSelectionFocus";

type AccessibleName =
  | { ariaLabel: string; labelledBy?: never }
  | { ariaLabel?: never; labelledBy: string };

type MapResultSurfaceProps = {
  children: ReactNode;
  className: string;
  describedBy?: string;
  closeLabel?: string;
  showCloseButton?: boolean;
  onClose: () => void;
} & AccessibleName;

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  if ("disabled" in element && element.disabled === true) return false;
  return true;
}

/**
 * One non-modal result surface for every mobile map selection. It gives place,
 * event, parking, live-truck, discovery, and point cards the same focus,
 * Escape, close, motion, and visual contracts without trapping the map behind
 * a modal.
 */
export default function MapResultSurface({
  children,
  className,
  ariaLabel,
  labelledBy,
  describedBy,
  closeLabel = "Close map result",
  showCloseButton = true,
  onClose,
}: MapResultSurfaceProps) {
  const surfaceRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<HTMLElement | null>(null);
  const focusCapturedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // React Strict Mode deliberately replays effects in development. Capture
    // only once so the replay cannot replace the real opener with this surface.
    if (!focusCapturedRef.current) {
      const active = document.activeElement;
      const rememberedOpener = takeMapSelectionOpener();
      returnFocusRef.current =
        rememberedOpener?.exact ??
        (active instanceof HTMLElement &&
        active !== document.body &&
        active !== document.documentElement
          ? active
          : null);
      fallbackFocusRef.current = rememberedOpener?.fallback ?? null;
      focusCapturedRef.current = true;
    }
    surfaceRef.current?.focus({ preventScroll: true });
  }, []);

  const close = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;

    const returnTarget = returnFocusRef.current;
    try {
      onCloseRef.current();
    } catch (error) {
      closeRequestedRef.current = false;
      throw error;
    }

    // Closing changes parent selection state. Wait until React commits that
    // state so the map control is interactive again, then return keyboard
    // focus to the exact trigger that opened this result.
    const restoreFocus = (attempt = 0) => {
      if (canRestoreFocus(returnTarget)) {
        returnTarget.focus({ preventScroll: true });
        return;
      }
      if (canRestoreFocus(fallbackFocusRef.current)) {
        fallbackFocusRef.current.focus({ preventScroll: true });
        return;
      }

      // The parent removes `inert` in the same selection-closing commit. Give
      // concurrent React and the browser up to two more paint frames to expose
      // the original control before falling back to the map-view trigger.
      if (attempt < 2) {
        window.requestAnimationFrame(() => restoreFocus(attempt + 1));
        return;
      }
      document
        .querySelector<HTMLElement>('[aria-label="Choose what to see"]')
        ?.focus({ preventScroll: true });
    };
    window.requestAnimationFrame(() => restoreFocus());
  }, []);

  useEffect(() => {
    const closeFromAnywhere = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      // A place or event sheet can open above this non-modal preview while the
      // preview remains mounted. Do not let the background map consume Escape
      // before the foreground dialog gets it.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };

    // Capture on window rather than the card itself. Escape still works after
    // a person tabs back to the map, a browser extension moves focus, or a
    // nested control stops bubbling keyboard events.
    window.addEventListener("keydown", closeFromAnywhere, true);
    return () => window.removeEventListener("keydown", closeFromAnywhere, true);
  }, [close]);

  return (
    <section
      ref={surfaceRef}
      className={`map-result-surface ${className}`}
      data-map-result-surface
      role="region"
      tabIndex={-1}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <span className="map-result-handle" aria-hidden />
      {showCloseButton && (
        <button
          type="button"
          className="map-peek-close tap-44"
          onClick={close}
          aria-label={closeLabel}
        >
          <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
        </button>
      )}
      {children}
    </section>
  );
}
