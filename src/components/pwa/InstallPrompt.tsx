"use client";

import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Download, X, Share, Plus } from "lucide-react";

export default function InstallPrompt() {
  const { show, ios, promptInstall, dismiss } = useInstallPrompt();
  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-3)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
          style={{ background: "var(--app-brand)" }}
        >
          <Download className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-serif text-base font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Add Frederick Radius to your home screen
          </p>
          {ios ? (
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Tap{" "}
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: "var(--app-bg-sunken)" }}>
                <Share className="h-3 w-3" aria-hidden /> Share
              </span>{" "}
              in Safari, then{" "}
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: "var(--app-bg-sunken)" }}>
                <Plus className="h-3 w-3" aria-hidden /> Add to Home Screen
              </span>.
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              One tap to install as a real app. Opens in a single screen. Works offline for saved places.
            </p>
          )}
          {!ios && (
            <button
              type="button"
              onClick={promptInstall}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--app-brand)" }}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
