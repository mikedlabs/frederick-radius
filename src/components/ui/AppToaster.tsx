"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Toaster } from "sonner";
import { getAppearance, subscribeAppearance } from "@/lib/appearance";
import styles from "./AppToaster.module.css";

/** Clears the bottom nav on phones and sits 12px above the edge wherever the
 *  nav reserve is zero. */
const BOTTOM = "calc(env(safe-area-inset-bottom, 0px) + var(--app-bottomnav-reserve) + 12px)";

/* Inline on purpose. Sonner appends its own stylesheet after the app's, and
   its dark cancel-button rule outranks a class on the button. Both slots get
   the quiet secondary control: a filled Undo would put a second primary
   action on every screen. The surface reads a custom property so the
   stylesheet can still answer hover and press. */
const buttonStyle: CSSProperties = {
  height: 32,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: "var(--app-radius-sm)",
  background: "var(--toast-button-surface, var(--app-bg-elevated-solid))",
  border: "1px solid var(--app-control-border)",
  color: "var(--app-ink)",
};

/**
 * The one Sonner configuration for the app shell and Storybook. Raise toasts
 * through `@/lib/feedback/notify`; the surface, buttons, icons and timing are
 * decided here so call sites carry copy and handlers only.
 */
export default function AppToaster() {
  // Appearance is an explicit saved choice, not the OS setting, so Sonner's
  // own "system" theme would report the wrong one.
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance, () => "light" as const);
  return (
    <Toaster
      theme={appearance}
      position="bottom-center"
      offset={{ bottom: BOTTOM }}
      mobileOffset={{ bottom: BOTTOM, left: "12px", right: "12px" }}
      duration={4000}
      style={{ zIndex: "var(--z-toast)" }}
      icons={{
        success: <Check size={16} strokeWidth={1.75} aria-hidden />,
        error: <AlertCircle size={16} strokeWidth={1.75} aria-hidden />,
      }}
      toastOptions={{
        actionButtonStyle: buttonStyle,
        cancelButtonStyle: buttonStyle,
        classNames: {
          toast: styles.toast,
          actionButton: `tap-44 ${styles.button}`,
          cancelButton: `tap-44 ${styles.button}`,
        },
      }}
    />
  );
}
