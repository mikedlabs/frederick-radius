"use client";

import { useEffect } from "react";

/**
 * ExtensionNoiseFilter — a tiny client-only mount-point that catches
 * the specific unhandled rejections browser extensions tend to throw
 * inside the page's window context, so they don't light up Next.js's
 * dev-mode Console Error overlay.
 *
 * The current target is clipboard NotAllowedError. Several popular
 * extensions (the "iki" automation extension, some translation
 * extensions, certain accessibility tools) call
 * `navigator.clipboard.writeText()` outside a user-gesture context
 * — usually on focus or selection changes — and the browser denies
 * the call with `NotAllowedError: Failed to execute 'writeText' on
 * 'Clipboard': Write permission denied.` The extension doesn't
 * handle the rejection, so it bubbles to the page's window as an
 * unhandled rejection, which Next.js dev mode then logs as a red
 * Console Error.
 *
 * Our own three clipboard call sites (ShareButton, PlanBuilder,
 * EventActions) ALL wrap writeText in try/catch — this filter only
 * catches the extension-driven case where the rejection originates
 * outside our handlers.
 *
 * Production behavior: identical. The filter only suppresses the
 * specific extension-clipboard error pattern. Any real clipboard
 * error originating from our own code's user-gesture handlers still
 * surfaces through its existing try/catch.
 */
export default function ExtensionNoiseFilter() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      // Only swallow the specific clipboard write-permission rejection.
      // Anything else (network errors, type errors, our own throws) is
      // left to surface normally.
      if (
        reason instanceof DOMException &&
        reason.name === "NotAllowedError" &&
        /clipboard/i.test(reason.message)
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => {
      window.removeEventListener("unhandledrejection", handler);
    };
  }, []);
  return null;
}
