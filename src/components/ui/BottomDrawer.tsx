"use client";

import { Drawer } from "vaul";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { X } from "lucide-react";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import { haptic } from "@/lib/haptics";

/**
 * BottomDrawer — brand-aligned wrapper around the Vaul drawer
 * primitive. Per master UI brief §6 + §10 + §16: bottom sheets are
 * the native-feeling mobile pattern for filters, place previews,
 * amenities, and any deep-but-temporary view. Vaul handles the
 * drag-to-snap physics, focus trap, body-scroll lock, and ESC
 * handler — wrapping it here keeps brand styling DRY, and supplies the
 * app rules the library cannot know: Back closes the drawer in place
 * (`historyLayerId`), and a toast raised above it stays usable.
 *
 * Toasts: a press on a Sonner toast does not count as a press outside the
 * drawer, so its action runs and the drawer stays open. Known limit: Radix's
 * focus trap pulls Sonner's Alt+T shortcut back into the drawer, so a
 * keyboard cannot reach a toast while a drawer is open. Feedback that starts
 * inside a drawer should use an in-drawer status (BeerSheet's "Saved" label
 * is the model) and keep toasts for outcomes that outlive it.
 *
 * Usage:
 *   <BottomDrawer
 *     trigger={<button>Open filters</button>}
 *     title="Filters"
 *     subtitle="Filter what's showing"
 *   >
 *     {/* drawer content *\/}
 *   </BottomDrawer>
 *
 * Or controlled, when the trigger is somewhere else:
 *   <BottomDrawer open={isOpen} onOpenChange={setIsOpen} title="…">
 *     …
 *   </BottomDrawer>
 */
export type BottomDrawerProps = {
  /** Drawer content. */
  children: ReactNode;
  /** Optional in-place trigger button. Omit for controlled mode. */
  trigger?: ReactNode;
  /** Shown in the drawer header for context + screen readers. */
  title: string;
  /** Optional one-line subhead under the title. */
  subtitle?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Open-state callback for controlled mode. */
  onOpenChange?: (open: boolean) => void;
  /** Hide the visible title/subtitle header (kept for screen readers)
   *  so content can render flush under the drag handle — e.g. a
   *  full-bleed photo cover. Default false. */
  bareHeader?: boolean;
  /** Delegate Escape within an explicitly owned inline panel, if supplied. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Opaque by default, so the page beneath never reads through the
   *  controls. "translucent" is an explicit opt-in for a light surface. */
  surface?: "solid" | "translucent";
  /** "standard" caps the drawer at 760px and centers it from the `sm`
   *  breakpoint, matching BottomSheet. "wide" keeps the full width for
   *  content that was laid out for it. */
  width?: "standard" | "wide";
  /** Give a controlled drawer the app's Back rule: opening pushes one
   *  same-URL history entry, Back closes the drawer in place, every other
   *  close removes that entry, and an in-app link inside it replaces the
   *  entry instead of stranding it. Keep the id stable while the drawer is
   *  open. Omit it when the caller already owns a history entry for this
   *  drawer (a route or a query parameter). A caller that changes the URL as
   *  it closes the drawer must let the entry leave first, with
   *  `navigateAfterHistoryLayer(id, next)`. */
  historyLayerId?: string;
};

export default function BottomDrawer({
  children,
  trigger,
  title,
  subtitle,
  open,
  onOpenChange,
  bareHeader = false,
  onEscapeKeyDown,
  surface = "solid",
  width = "standard",
  historyLayerId,
}: BottomDrawerProps) {
  const ownsHistoryLayer = Boolean(historyLayerId) && open !== undefined;

  // Most controlled drawers are opened by a button outside Drawer.Root, so
  // Radix has no registered trigger to restore. Remember that real opener
  // before Vaul moves focus into the modal.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const drawerOpenRef = useRef(Boolean(open));
  const previousControlledOpenRef = useRef(false);
  const historyLayer = useReversibleHistoryLayer({
    active: ownsHistoryLayer && Boolean(open),
    id: historyLayerId ?? "",
    // Back asks the parent to close. A drawer that has already closed has
    // nothing left to report.
    onDismiss: () => {
      if (drawerOpenRef.current) onOpenChange?.(false);
    },
  });

  const rememberCurrentFocus = useCallback(() => {
    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
  }, []);

  const restoreRememberedFocus = useCallback(() => {
    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
    }
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    const restoreWhenSafe = () => {
      restoreFrameRef.current = null;
      if (drawerOpenRef.current) return;
      const returnTarget = returnFocusRef.current;
      if (!returnTarget?.isConnected) return;
      const focusIsSafe = () => {
        const activeModals = document.querySelectorAll(
          '[role="dialog"][aria-modal="true"]:not([aria-hidden="true"]):not([data-state="closed"])',
        );
        return Array.from(activeModals).every((modal) => modal.contains(returnTarget));
      };
      if (returnTarget.closest('[aria-hidden="true"]')) {
        // Vaul keeps the background hidden during its 500ms exit animation.
        // This fallback also covers test environments where animation-end never
        // fires; onCloseAutoFocus replaces it as soon as the real exit finishes.
        restoreTimerRef.current = window.setTimeout(() => {
          restoreTimerRef.current = null;
          if (
            !drawerOpenRef.current
            && returnTarget.isConnected
            && focusIsSafe()
          ) {
            returnTarget.focus({ preventScroll: true });
          }
        }, 550);
        return;
      }
      if (returnTarget.isConnected && focusIsSafe()) {
        returnTarget.focus({ preventScroll: true });
      }
    };
    restoreFrameRef.current = window.requestAnimationFrame(restoreWhenSafe);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) rememberCurrentFocus();
      // In controlled mode, the prop is the source of truth. A parent may
      // delay or reject a close request, so do not mark the drawer closed or
      // restore focus until the controlled `open` value actually changes.
      if (open === undefined) drawerOpenRef.current = nextOpen;
      onOpenChange?.(nextOpen);
      haptic("light");
      if (!nextOpen && open === undefined) restoreRememberedFocus();
    },
    [onOpenChange, open, rememberCurrentFocus, restoreRememberedFocus],
  );

  // Same rule as BottomSheet: an in-app link replaces the drawer's temporary
  // entry with its destination, leaving one clean Back step to this page.
  const onLinkCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      !ownsHistoryLayer
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (
      !anchor
      || (anchor.target && anchor.target !== "_self")
      || anchor.hasAttribute("download")
    ) {
      return;
    }
    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin !== window.location.origin
      || !["http:", "https:"].includes(destination.protocol)
    ) {
      return;
    }
    const href = `${destination.pathname}${destination.search}${destination.hash}`;
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href === here) return;
    event.preventDefault();
    event.stopPropagation();
    haptic("light");
    historyLayer.leaveTo(href);
  };

  useLayoutEffect(() => {
    if (open === undefined) return;

    const wasOpen = previousControlledOpenRef.current;
    if (open && !wasOpen) rememberCurrentFocus();
    drawerOpenRef.current = open;
    previousControlledOpenRef.current = open;
    if (!open && wasOpen) {
      // One place removes the drawer's history entry, whichever way it closed:
      // Close, Escape, the overlay, a drag, or the parent's own control such
      // as "Show 12 beers". After Back the entry is already gone and this
      // does nothing, so Back never lands on a dead same-URL stop.
      if (ownsHistoryLayer) historyLayer.dismiss();
      restoreRememberedFocus();
    }
  }, [historyLayer, open, ownsHistoryLayer, rememberCurrentFocus, restoreRememberedFocus]);

  useLayoutEffect(
    () => () => {
      // Route drawers close by unmounting their slot, without receiving
      // open=false. Treat that removal as a completed close as well.
      const shouldRestore = drawerOpenRef.current
        || restoreFrameRef.current !== null
        || restoreTimerRef.current !== null;
      drawerOpenRef.current = false;
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
      }
      if (shouldRestore) restoreRememberedFocus();
    },
    [restoreRememberedFocus],
  );

  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal
      autoFocus
    >
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/45" />
        <Drawer.Content
          onEscapeKeyDown={onEscapeKeyDown}
          onClickCapture={onLinkCapture}
          onPointerDownOutside={(event) => {
            // Radix dispatches this on the pressed element. A toast sits
            // outside the drawer in the DOM but belongs to the same task.
            if (
              event.target instanceof Element
              && event.target.closest("[data-sonner-toaster]")
            ) event.preventDefault();
          }}
          aria-modal="true"
          data-drawer-surface={surface}
          data-drawer-width={width}
          {...(subtitle ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef.current?.isConnected) return;
            event.preventDefault();
            if (
              drawerOpenRef.current
              || restoreFrameRef.current !== null
              || restoreTimerRef.current !== null
            ) restoreRememberedFocus();
          }}
          // bottom-0 stays at every width: an offset would leave a strip
          // visible at the end of Vaul's exit transform.
          className={`fixed bottom-0 left-0 right-0 z-[var(--z-overlay)] mt-24 flex max-h-[90dvh] flex-col rounded-t-[var(--app-radius-lg)] border-t outline-none${
            width === "standard" ? " sm:mx-auto sm:max-w-[760px] sm:border-x" : ""
          }`}
          style={{
            background: surface === "translucent" ? "var(--app-bg-elevated)" : "var(--app-bg-elevated-solid)",
            borderColor: "var(--app-border)",
            boxShadow: "var(--app-elev-3), var(--app-edge), var(--app-hi)",
          }}
        >
          {/* Drag handle — Vaul gives this for free at the top
              of the content; we render an explicit visual handle
              + an accessible title for screen readers. */}
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 rounded-full"
            style={{ background: "var(--app-border)" }}
          />
          <Drawer.Close asChild aria-label={`Close ${title}`}>
            <button
              type="button"
              onClick={() => haptic("light")}
              aria-label={`Close ${title}`}
              className="absolute top-2 z-10 grid h-11 w-11 place-items-center rounded-full border transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-95"
              style={{
                right: "max(0.75rem, env(safe-area-inset-right, 0px))",
                borderColor: "var(--app-control-border)",
                background: "var(--app-bg-elevated-solid)",
                color: "var(--app-ink-2)",
              }}
            >
              <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </button>
          </Drawer.Close>
          {bareHeader ? (
            // Header kept for screen readers only — the content provides
            // its own visual header (e.g. a photo cover).
            <>
              <Drawer.Title className="sr-only">{title}</Drawer.Title>
              {subtitle ? (
                <Drawer.Description className="sr-only">{subtitle}</Drawer.Description>
              ) : null}
            </>
          ) : (
            <div
              className="border-b pb-3 pt-2"
              style={{
                borderColor: "var(--app-border)",
                paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
                paddingRight: "max(3.5rem, calc(env(safe-area-inset-right, 0px) + 3.5rem))",
              }}
            >
              <Drawer.Title
                className="font-sans text-[18px] font-extrabold tracking-[-0.02em]"
                style={{ color: "var(--app-ink)" }}
              >
                {title}
              </Drawer.Title>
              {subtitle ? (
                <Drawer.Description
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {subtitle}
                </Drawer.Description>
              ) : null}
            </div>
          )}
          {/* Scrollable body. Vaul's drag physics work with content
              that's scrollable below the handle row. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom,0px)+24px,24px)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
