"use client";

import { usePathname } from "next/navigation";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Download, X, Share, Plus } from "lucide-react";

/**
 * InstallPrompt — the "add to home screen" nudge.
 *
 * Redesigned to feel inviting, not intrusive: a slim brand-gradient
 * glass card that slides in gently (pop-in), with a generous, obvious
 * dismiss so it never feels like a trap. The useInstallPrompt hook
 * gates WHEN it appears; this is purely how it looks when it does.
 *
 * Suppressed on the full-bleed map and the focused Ask workspace. Both
 * surfaces use the lower viewport for primary controls or answer content;
 * the install nudge can wait for a less time-sensitive page.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const { show, ios, promptInstall, dismiss } = useInstallPrompt();
  if (!show || pathname === "/map" || pathname.startsWith("/ask")) return null;

  return (
    <div
      role="complementary"
      aria-labelledby="install-title"
      className="pop-in fixed inset-x-3 z-[var(--z-prompt)] mx-auto max-w-sm overflow-hidden rounded-[var(--app-radius-xl)] border backdrop-blur-md"
      style={{
        // 5rem (was Tailwind bottom-20) PLUS the home-indicator inset — every
        // sibling floating element adds env(safe-area-inset-bottom) but this
        // one didn't, so on a notched phone it sat under the home bar
        // (2026-07 shell-hardening P1).
        bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        borderColor: "var(--app-border)",
        // Soft brand wash fading to elevated paper — warm and on-brand
        // rather than a stark white takeover.
        background:
          "linear-gradient(155deg, color-mix(in srgb, var(--app-brand) 13%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 60%)",
        boxShadow: "var(--app-elev-3), var(--app-hi)",
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="tactile-interactive absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full transition active:scale-[0.9]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <div className="flex items-start gap-3 p-3.5 pr-10">
        <div
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
          style={{
            background: "linear-gradient(140deg, var(--app-brand) 0%, var(--app-brand-2) 100%)",
            boxShadow: "var(--app-shadow-1), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <Download className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-serif text-[15px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Install Frederick Radius
          </p>
          {ios ? (
            <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Tap{" "}
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ background: "var(--app-bg-sunken)" }}>
                <Share className="h-3 w-3" aria-hidden /> Share
              </span>{" "}
              in Safari, then{" "}
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ background: "var(--app-bg-sunken)" }}>
                <Plus className="h-3 w-3" aria-hidden /> Add to Home Screen
              </span>.
            </p>
          ) : (
            <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Add it to your home screen so it opens full-screen and keeps saved places available offline.
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-3">
            {!ios && (
              <button
                type="button"
                onClick={promptInstall}
                className="tactile-interactive inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-meta-lg font-semibold text-white transition active:scale-[0.96]"
                style={{ background: "var(--app-brand)" }}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="text-meta-lg font-semibold transition active:opacity-70"
              style={{ color: "var(--app-ink-3)" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
