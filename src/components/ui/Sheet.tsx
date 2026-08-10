"use client";

import type { ReactNode } from "react";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";

/**
 * Compatibility wrapper for the app's canonical progressive-detail surface.
 *
 * Ask and Feedback historically carried a second hand-built sheet with
 * different motion, focus, swipe, and touch-target behavior. Keeping this
 * small adapter preserves their simple API while BottomSheet owns the actual
 * dialog contract everywhere: focus trap and return, reduced motion, Escape,
 * backdrop and drag dismissal, route cleanup, safe areas, and body scroll.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  maxHeight = "85dvh",
  historyLayerId,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  /** Tallest the panel can grow. */
  maxHeight?: string;
  /** Optional native Back-button layer for route-owned temporary surfaces. */
  historyLayerId?: string;
}) {
  const label = title?.trim() || "Details";

  return (
    <BottomSheet
      present={open}
      onClose={onClose}
      ariaLabel={label}
      historyLayerId={historyLayerId}
      maxHeight={maxHeight}
    >
      {(dismiss) => (
        <>
          <SheetHandle onClose={dismiss} closeLabel={`Close ${label}`} />

          {title || subtitle ? (
            <header
              className="border-b pb-3 pt-1"
              style={{
                borderColor: "var(--app-border)",
                paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
                paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
              }}
            >
              {title ? (
                <h2
                  className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <p
                  className="mt-0.5 text-[13px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {subtitle}
                </p>
              ) : null}
            </header>
          ) : null}

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pt-3"
            style={{
              paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
              paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
            }}
          >
            {children}
          </div>

          {footer ? (
            <footer
              className="shrink-0 border-t py-3"
              style={{
                borderColor: "var(--app-border)",
                paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
                paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
              }}
            >
              {footer}
            </footer>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}
