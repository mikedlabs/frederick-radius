"use client";

import { Drawer } from "vaul";
import type { ReactNode } from "react";

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
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 z-[var(--z-overlay)]"
          style={{ background: "rgba(10, 8, 4, 0.45)" }}
        />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[var(--z-overlay)] mt-24 flex max-h-[90vh] flex-col rounded-t-[24px] border-t outline-none"
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
              className="border-b px-4 pb-3 pt-2"
              style={{ borderColor: "var(--app-border)" }}
            >
              <Drawer.Title
                className="font-serif text-[18px] font-semibold tracking-tight"
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
