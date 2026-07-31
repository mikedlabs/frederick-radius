"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ArrowRight, Check, Download } from "lucide-react";
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
      <section className="sv-colophon" aria-label="Keep Frederick Radius handy">
        <div className="inner">
          <button
            type="button"
            onClick={openReturnBridge}
            className="sv-colophon-row w-full text-left"
          >
            <span className="k">Keep this list easy to find</span>
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

  return (
    <section
      id={id}
      aria-label="Keep Frederick Radius handy"
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: installed
          ? "color-mix(in srgb, var(--app-positive) 32%, var(--app-border))"
          : "var(--app-border)",
        background: "var(--app-bg-elevated)",
        scrollMarginTop: "calc(var(--app-topbar-h) + 1rem)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{
            background: installed
              ? "color-mix(in srgb, var(--app-positive) 14%, transparent)"
              : "color-mix(in srgb, var(--app-brand) 12%, transparent)",
            color: installed ? "var(--app-positive)" : "var(--app-brand)",
          }}
        >
          {installed ? (
            <Check className="h-4 w-4" strokeWidth={2.5} />
          ) : (
            <Download className="h-4 w-4" strokeWidth={2.25} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {installed ? "Radius is on this device" : "Keep Radius handy"}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            {installed
              ? "Open it from your Home Screen whenever you need it."
              : "Add it to this device, or save a return link for later."}
          </span>
        </span>
        {!installed ? (
          <button
            type="button"
            onClick={openReturnBridge}
            className="min-h-11 shrink-0 rounded-full px-3 text-[12px] font-semibold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
          >
            Set up
          </button>
        ) : null}
      </div>
    </section>
  );
}
