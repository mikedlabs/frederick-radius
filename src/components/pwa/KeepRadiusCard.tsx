"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  ROW_HELP,
  SettingsRow,
  SettingsSection,
  helpStyle,
} from "@/components/settings/SettingsSection";
import { isStandalone } from "@/lib/pwa-display";
import {
  RETURN_BRIDGE_INSTALLED_EVENT,
  markReturnBridgeInstalledThisSession,
  openReturnBridge,
  wasReturnBridgeInstalledThisSession,
} from "@/lib/return-bridge";

function subscribeInstalled(listener: () => void): () => void {
  const displayMode = window.matchMedia("(display-mode: standalone)");
  const onInstalled = () => {
    markReturnBridgeInstalledThisSession();
  };
  const onDisplayMode = () => listener();
  window.addEventListener("appinstalled", onInstalled);
  window.addEventListener(RETURN_BRIDGE_INSTALLED_EVENT, listener);
  displayMode.addEventListener("change", onDisplayMode);
  return () => {
    window.removeEventListener("appinstalled", onInstalled);
    window.removeEventListener(RETURN_BRIDGE_INSTALLED_EVENT, listener);
    displayMode.removeEventListener("change", onDisplayMode);
  };
}

function installedSnapshot(): boolean {
  return wasReturnBridgeInstalledThisSession() || isStandalone();
}

function installedServerSnapshot(): boolean {
  return false;
}

export default function KeepRadiusCard({
  variant = "card",
  id,
  openFromHash = false,
}: {
  variant?: "card" | "row";
  id?: string;
  openFromHash?: boolean;
}) {
  const installed = useSyncExternalStore(
    subscribeInstalled,
    installedSnapshot,
    installedServerSnapshot,
  );

  useEffect(() => {
    let frame = 0;
    const openHashTarget = () => {
      if (
        openFromHash
        && window.location.hash === "#keep-radius"
        && !installed
      ) {
        frame = window.requestAnimationFrame(openReturnBridge);
      }
    };
    window.addEventListener("hashchange", openHashTarget);
    openHashTarget();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openHashTarget);
    };
  }, [installed, openFromHash]);

  if (variant === "row") {
    if (installed) return null;
    return (
      <section className="sv-colophon" aria-label="Add Frederick Radius to your Home Screen">
        <div className="inner">
          <button
            type="button"
            onClick={openReturnBridge}
            className="sv-colophon-row w-full text-left"
          >
            <span className="k">Add Radius to your Home Screen</span>
            <span className="v link">
              Set up
              <ArrowRight
                aria-hidden
                className="ml-1 inline h-3.5 w-3.5 -translate-y-px"
                strokeWidth={2.25}
              />
            </span>
          </button>
        </div>
      </section>
    );
  }

  // Settings and /install: a labelled ruled row on the page ground. "Add" is
  // a 6px outlined button, so the page carries no coral field.
  return (
    <SettingsSection
      id={id}
      ariaLabel="Add Frederick Radius to your Home Screen"
      title={installed ? "Radius is on this device" : "Add Radius to your Home Screen"}
      style={{ scrollMarginTop: "calc(var(--app-topbar-h) + 1rem)" }}
    >
      <SettingsRow
        trailing={
          !installed ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={openReturnBridge}
              className="text-[0.875rem]"
            >
              Add
            </Button>
          ) : undefined
        }
      >
        <p className={`flex items-start gap-2 ${ROW_HELP}`} style={helpStyle}>
          {installed ? (
            <Check
              aria-hidden
              className="mt-[0.2em] h-4 w-4 shrink-0"
              strokeWidth={2.5}
              style={{ color: "var(--app-forest-text)" }}
            />
          ) : null}
          <span className="min-w-0">
            {installed
              ? "Open it from your Home Screen whenever you need it."
              : "Open Radius like an app with one tap from your phone."}
          </span>
        </p>
      </SettingsRow>
    </SettingsSection>
  );
}
