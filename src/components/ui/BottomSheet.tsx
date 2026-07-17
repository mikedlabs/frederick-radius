"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { X } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * BottomSheet — the shared progressive-detail shell (app-like pass,
 * phase 2). Extracted verbatim from PlaceSheet's proven machinery so
 * every sheet in the app dismisses, drags, traps focus, and animates
 * the same way: spring up from the bottom, drag-down or backdrop-tap
 * or ESC to dismiss, focus moved in on open and restored to the
 * trigger on close, body scroll locked while open.
 *
 * The shell owns presence and exit choreography; the CONTENT stays
 * with the caller via a render prop that receives `dismiss` (starts
 * the exit animation — `onClose` then fires once the sheet is fully
 * off-screen). Callers keep their item state set until onClose so the
 * exiting sheet never flashes empty.
 */
type Props = {
  /** Render the sheet while true; flipping false plays the exit. */
  present: boolean;
  /** Fires after the exit animation completes (also on drag-dismiss). */
  onClose: () => void;
  /** Accessible name for the dialog. */
  ariaLabel: string;
  children: (dismiss: () => void) => ReactNode;
};

export default function BottomSheet({ present, onClose, ariaLabel, children }: Props) {
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 300], [0.45, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Remember what was focused before opening so we can restore it on close —
  // a baseline dialog expectation.
  const lastFocused = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  // Keep Tab within the sheet while it's open.
  useFocusTrap(sheetRef, open && present);

  useEffect(() => {
    if (present) {
      lastFocused.current = (document.activeElement as HTMLElement | null) ?? null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs sheet-open state to the incoming presence prop to drive the open animation
      setOpen(true);
      haptic("light");
    }
  }, [present]);

  // Move focus into the sheet on open; restore it to the trigger on close.
  useEffect(() => {
    if (open) {
      sheetRef.current?.focus();
    } else if (lastFocused.current) {
      lastFocused.current.focus?.();
      lastFocused.current = null;
    }
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC dismisses — a baseline keyboard-accessibility expectation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dismiss = () => {
    haptic("light");
    setOpen(false);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      haptic("light");
      setOpen(false);
      setTimeout(onClose, 220);
    } else {
      y.set(0);
    }
  };

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && present && (
        <div className="fixed inset-0 z-[var(--z-overlay)]" aria-modal="true" role="dialog" aria-label={ariaLabel}>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            className="absolute inset-0 bg-black"
            style={{ opacity: backdropOpacity }}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 600 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            style={{ y }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[var(--app-radius-lg)] border-t bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
          >
            {children(dismiss)}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * SheetHandle — the shared top row: labeled Close button (audit: a
 * bare X read as "locked"), the drag pill, and a balancing spacer.
 * Every sheet uses the same row so dismissal reads identically.
 */
export function SheetHandle({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
      <button
        type="button"
        onClick={() => { haptic("light"); onClose(); }}
        aria-label={closeLabel}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition active:scale-[0.96]"
        style={{ color: "var(--app-ink-2)" }}
      >
        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Close
      </button>
      <span
        aria-hidden
        className="block h-1 w-10 rounded-full"
        style={{ background: "var(--app-border)" }}
      />
      <span className="w-[64px]" aria-hidden />
    </div>
  );
}
