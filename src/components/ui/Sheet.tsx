"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Sheet — the canonical bottom sheet.
 *
 * Slides up from the bottom over a scrim. Closes on: ESC, scrim click,
 * the close button, or a downward swipe past a threshold. The actual
 * mount lives in a portal so the sheet escapes any clipping ancestor
 * (carousel, overflow:hidden, transform stacks). Safe-area aware.
 *
 * The body gets `overflow: hidden` while open so the underlying page
 * doesn't scroll out from under the user's finger.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  maxHeight = "85dvh",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  /** Tallest the sheet panel can grow. Default 85dvh leaves a glimpse
   *  of the page above so the user knows there's a scrim to tap. */
  maxHeight?: string;
}) {
  // Two-phase open so we can transition from translateY(100%) → 0.
  // `mounted` adds the node; `entered` runs the in-transition on the
  // next frame. On close, we reverse and unmount when the animation
  // is done so the portal doesn't accumulate dead nodes.
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  // Mirror the drag state into render-reactive state so the transition
  // suppress (snap-follow vs spring-back) doesn't depend on reading
  // a ref during render — refs aren't reactive.
  const [dragging, setDragging] = useState(false);

  // Two-phase open/close animation. The setStates here ARE the
  // intent — they drive a 280ms slide-in/out then unmount. Not a
  // cascade in the React docs sense; the rule is overcautious here.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(t);
  }, [open]);

  // Lock body scroll while open. Tracking with a ref guards against
  // double-application if the component mounts twice in StrictMode.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ESC closes the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Swipe-down dismiss. We track touchmove on the drag handle / header
  // area only; the scrollable body keeps its native scroll so a swipe
  // inside long content scrolls instead of dismissing. The threshold
  // is 80px or 25% of the panel height, whichever is smaller.
  const onTouchStart: React.TouchEventHandler = (e) => {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove: React.TouchEventHandler = (e) => {
    if (dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragOffset(dy > 0 ? dy : 0);
  };
  const onTouchEnd = () => {
    const dy = dragOffset;
    const threshold = Math.min(80, (panelRef.current?.offsetHeight ?? 600) * 0.25);
    dragStartY.current = null;
    setDragging(false);
    setDragOffset(0);
    if (dy > threshold) onClose();
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-modal="true"
      role="dialog"
      aria-label={title ?? "Sheet"}
      className="fixed inset-0 z-[var(--z-overlay)]"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{
          background: "rgba(20, 20, 18, 0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: entered ? 1 : 0,
          transition: "opacity 220ms var(--app-ease-out)",
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-screen-md flex-col rounded-t-[var(--app-radius-xl)] bg-[var(--app-bg-elevated)] tactile-e3"
        style={{
          maxHeight,
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: entered
            ? `translateY(${dragOffset}px)`
            : "translateY(100%)",
          transition: dragging
            ? "none"
            : "transform 280ms var(--app-ease-spring)",
          willChange: "transform",
        }}
      >
        {/* Drag handle + header (the touch-zone for swipe-to-dismiss) */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="cursor-grab touch-pan-y select-none"
        >
          <div className="flex justify-center pt-2.5 pb-1.5">
            <div
              aria-hidden
              className="h-1 w-10 rounded-full"
              style={{ background: "var(--app-border-strong, rgba(0,0,0,0.18))" }}
            />
          </div>
          {(title || subtitle) && (
            <div className="flex items-start gap-3 px-5 pb-3 pt-1">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2
                    className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p
                    className="mt-0.5 text-[13px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)]"
                style={{ color: "var(--app-ink-2)" }}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          )}
        </div>
        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">
          {children}
        </div>
        {footer && (
          <div
            className="border-t px-5 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
