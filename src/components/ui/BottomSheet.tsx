"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import {
  motion,
  AnimatePresence,
  useDragControls,
  useMotionValue,
  useTransform,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

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
  /** Stable across the lazy fallback and the real sheet mount. */
  historyLayerId?: string;
  /**
   * The trigger captured before a lazy fallback takes focus. Without this,
   * a lazily mounted sheet remembers the fallback's Close button, which is
   * removed as soon as the real chunk arrives and cannot receive focus later.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: (dismiss: () => void) => ReactNode;
};

const SheetDragContext = createContext<
  ((event: ReactPointerEvent<HTMLElement>) => void) | null
>(null);

type FocusReturn = {
  element: HTMLElement;
  tagName: string;
  id: string;
  ariaLabel: string | null;
  href: string | null;
  text: string;
};

function describeFocusReturn(element: HTMLElement): FocusReturn {
  return {
    element,
    tagName: element.tagName,
    id: element.id,
    ariaLabel: element.getAttribute("aria-label"),
    href: element.getAttribute("href"),
    text: element.textContent?.trim() ?? "",
  };
}

function resolveFocusReturn(saved: FocusReturn): HTMLElement | null {
  if (saved.element.isConnected) return saved.element;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(saved.tagName.toLowerCase()),
  );
  if (saved.id) {
    const byId = document.getElementById(saved.id);
    if (byId instanceof HTMLElement) return byId;
  }
  if (saved.ariaLabel) {
    const byLabel = candidates.find(
      (candidate) =>
        candidate.getAttribute("aria-label") === saved.ariaLabel,
    );
    if (byLabel) return byLabel;
  }
  if (saved.href) {
    const byHref = candidates.find(
      (candidate) => candidate.getAttribute("href") === saved.href,
    );
    if (byHref) return byHref;
  }
  return (
    candidates.find(
      (candidate) =>
        saved.text.length > 0 &&
        candidate.textContent?.trim() === saved.text &&
        candidate.offsetParent !== null,
    ) ?? null
  );
}

export default function BottomSheet({
  present,
  onClose,
  ariaLabel,
  historyLayerId,
  returnFocusRef,
  children,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const dragControls = useDragControls();
  const backdropOpacity = useTransform(y, [0, 300], [0.45, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Remember what was focused before opening so we can restore it on close —
  // a baseline dialog expectation.
  const lastFocused = useRef<FocusReturn | null>(null);
  const openPath = useRef(pathname);
  const onCloseRef = useRef(onClose);
  // A sheet that was already in the shell mounts closed and follows `present`
  // below. A code-split sheet first mounts with `present=true`; initializing
  // from that value prevents Suspense from replacing its fallback with one
  // blank frame before the opening effect runs.
  const [open, setOpen] = useState(present);
  const historyLayer = useReversibleHistoryLayer({
    active: open && present && Boolean(historyLayerId),
    id: historyLayerId ?? "",
    onDismiss: () => setOpen(false),
  });
  const dismiss = useCallback(() => {
    haptic("light");
    historyLayer.dismiss();
  }, [historyLayer]);
  const restoreLastFocus = useCallback(() => {
    const saved = lastFocused.current;
    if (!saved) return;
    lastFocused.current = null;

    // A same-URL Back traversal can make Map replace its peek node. Restore
    // after the exit has completed, when the obscured surface is interactive
    // again, and allow two paint frames for an equivalent trigger to settle.
    const restore = (attempt = 0) => {
      const target = resolveFocusReturn(saved);
      if (target) {
        target.focus({ preventScroll: true });
        return;
      }
      if (attempt < 2) {
        window.requestAnimationFrame(() => restore(attempt + 1));
      }
    };
    restore();
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep Tab within the sheet while it's open.
  useFocusTrap(sheetRef, open && present);

  useEffect(() => {
    if (present) {
      openPath.current = window.location.pathname;
      const focusReturn =
        returnFocusRef?.current ??
        (document.activeElement as HTMLElement | null) ??
        null;
      lastFocused.current = focusReturn
        ? describeFocusReturn(focusReturn)
        : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs sheet-open state to the incoming presence prop to drive the open animation
      setOpen(true);
      haptic("light");
    } else {
      // A parent can clear its selected item directly. Mirror that state so
      // focus restoration and the body-scroll lock cannot remain active.
      setOpen(false);
    }
  }, [present, returnFocusRef]);

  // App layouts persist across client navigations. A sheet that launched a
  // detail page must not remain mounted over the destination if a navigation
  // races its exit animation. Search-only map state changes stay on the same
  // pathname and intentionally keep the sheet open.
  useEffect(() => {
    if (!open || pathname === openPath.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes a route-scoped overlay after its owning route has changed
    setOpen(false);
    onCloseRef.current();
  }, [open, pathname]);

  // Move focus into the sheet on open. Focus returns from onExitComplete,
  // after the closing layer is gone and the underlying control is usable.
  useLayoutEffect(() => {
    if (open) {
      sheetRef.current?.focus();
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
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, open]);

  const onLinkCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (
      !anchor ||
      (anchor.target && anchor.target !== "_self") ||
      anchor.hasAttribute("download")
    ) {
      return;
    }
    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin !== window.location.origin ||
      !["http:", "https:"].includes(destination.protocol)
    ) {
      return;
    }
    const href = `${destination.pathname}${destination.search}${destination.hash}`;
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href === here) return;

    // Own same-origin sheet navigation so the temporary history entry is gone
    // before Next creates the destination entry. Sheet links only add a
    // haptic/close handler, which this shared path supplies directly.
    event.preventDefault();
    event.stopPropagation();
    haptic("light");
    historyLayer.leave(() => router.push(href));
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      haptic("light");
      historyLayer.dismiss();
    } else {
      y.set(0);
    }
  };

  return (
    <AnimatePresence
      onExitComplete={() => {
        restoreLastFocus();
        onClose();
      }}
    >
      {open && present && (
        <div
          className="fixed inset-0 z-[var(--z-overlay)]"
          aria-modal="true"
          role="dialog"
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            // The window listener covers focus that escapes the dialog; this
            // synchronous handler also honors Escape on the very first frame,
            // before passive effects have installed that listener.
            if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }}
        >
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
            onClickCapture={onLinkCapture}
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 600 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            style={{ y }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[var(--app-radius-lg)] border-t bg-[var(--app-bg-elevated)] pb-[env(safe-area-inset-bottom,0px)] shadow-[var(--app-shadow-3)]"
          >
            <SheetDragContext.Provider
              value={(event) => dragControls.start(event)}
            >
              {children(dismiss)}
            </SheetDragContext.Provider>
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
  const startDrag = useContext(SheetDragContext);
  return (
    <div
      className="flex items-center justify-between gap-2 pb-1 pt-2"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
    >
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
        className="grid h-11 w-16 touch-none cursor-grab place-items-center active:cursor-grabbing"
        onPointerDown={(event) => startDrag?.(event)}
      >
        <span
          className="block h-1 w-10 rounded-full"
          style={{ background: "var(--app-border)" }}
        />
      </span>
      <span className="w-[64px]" aria-hidden />
    </div>
  );
}
