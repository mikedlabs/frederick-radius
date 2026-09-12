"use client";

import { Drawer } from "vaul";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { X } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * BottomDrawer — brand-aligned wrapper around the Vaul drawer
 * primitive. Per master UI brief §6 + §10 + §16: bottom sheets are
 * the native-feeling mobile pattern for filters, place previews,
 * amenities, and any deep-but-temporary view. Vaul handles the
 * drag-to-snap physics, focus trap, body-scroll lock, and ESC
 * handler — wrapping it here keeps brand styling DRY.
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
};

export default function BottomDrawer({
  children,
  trigger,
  title,
  subtitle,
  open,
  onOpenChange,
  bareHeader = false,
}: BottomDrawerProps) {
  // Most controlled drawers are opened by a button outside Drawer.Root, so
  // Radix has no registered trigger to restore. Remember that real opener
  // before Vaul moves focus into the modal.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const drawerOpenRef = useRef(Boolean(open));
  const previousControlledOpenRef = useRef(false);

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
      if (returnTarget.closest('[aria-hidden="true"]')) {
        // Vaul keeps the background hidden during its 500ms exit animation.
        // This fallback also covers test environments where animation-end never
        // fires; onCloseAutoFocus replaces it as soon as the real exit finishes.
        restoreTimerRef.current = window.setTimeout(() => {
          restoreTimerRef.current = null;
          if (!drawerOpenRef.current && returnTarget.isConnected) {
            returnTarget.focus({ preventScroll: true });
          }
        }, 550);
        return;
      }
      if (returnTarget.isConnected) {
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

  useLayoutEffect(() => {
    if (open === undefined) return;

    const wasOpen = previousControlledOpenRef.current;
    if (open && !wasOpen) rememberCurrentFocus();
    drawerOpenRef.current = open;
    previousControlledOpenRef.current = open;
    if (!open && wasOpen) restoreRememberedFocus();
  }, [open, rememberCurrentFocus, restoreRememberedFocus]);

  useLayoutEffect(
    () => () => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
      }
    },
    [],
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
        <Drawer.Overlay
          className="fixed inset-0 z-[var(--z-overlay)]"
          style={{ background: "rgba(10, 8, 4, 0.45)" }}
        />
        <Drawer.Content
          aria-modal="true"
          {...(subtitle ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef.current?.isConnected) return;
            event.preventDefault();
            restoreRememberedFocus();
          }}
          className="fixed bottom-0 left-0 right-0 z-[var(--z-overlay)] mt-24 flex max-h-[90dvh] flex-col rounded-t-[24px] border-t outline-none"
          style={{
            background: "var(--app-bg-elevated)",
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
          <Drawer.Close
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
