"use client";

import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import RippleMark from "@/components/brand/RippleMark";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { isInstallPromptSuppressedPath } from "@/lib/pwa-display";

/**
 * A small return-path to the field guide, shown only after someone has used
 * the product and come back. It never pretends iOS can install itself:
 * browser chrome owns Add to Home Screen, so the guide shows exact steps.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const { show, ios, prompting, promptInstall, dismiss } = useInstallPrompt();

  if (!show || isInstallPromptSuppressedPath(pathname)) return null;

  return (
    <aside
      aria-labelledby="install-title"
      className="pop-in fixed z-[var(--z-prompt)] mx-auto max-w-sm overflow-y-auto overscroll-contain rounded-[var(--app-radius-xl)] border backdrop-blur-md"
      style={{
        left: "max(0.75rem, env(safe-area-inset-left, 0px))",
        right: "max(0.75rem, env(safe-area-inset-right, 0px))",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--app-bottomnav-reserve, 0px) + 68px)",
        maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - var(--app-bottomnav-reserve, 0px) - 80px)",
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-3), var(--app-hi)",
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close install reminder"
        className="tactile-interactive absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full transition active:scale-[0.9]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      <div className="flex items-start gap-3 p-4 pr-11">
        <RippleMark size={44} tile detail="full" className="shrink-0" />

        <div className="min-w-0 flex-1">
          <p
            id="install-title"
            className="font-sans text-[15px] font-semibold leading-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Keep Frederick Radius handy
          </p>

          {ios ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Safari requires one short system step before Frederick Radius can appear on your Home Screen.
              </p>

              <ol
                id="install-ios-steps"
                className="mt-3 space-y-2 rounded-[var(--app-radius-md)] border p-3 text-[12px] leading-relaxed"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-subtle)",
                  color: "var(--app-ink-2)",
                }}
              >
                <li className="flex gap-2">
                  <Share className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  <span>Tap Safari&rsquo;s <strong>Share</strong> button.</span>
                </li>
                <li className="pl-6">Choose <strong>Add to Home Screen</strong>.</li>
                <li className="pl-6">Keep <strong>Open as Web App</strong> on, then tap <strong>Add</strong>.</li>
              </ol>
            </>
          ) : (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Add the guide to your home screen so it opens in its own window and is easy to find again.
              </p>
              <button
                type="button"
                onClick={promptInstall}
                disabled={prompting}
                className="tactile-interactive mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-meta-lg font-semibold text-white transition active:scale-[0.96] disabled:cursor-wait disabled:opacity-70"
                style={{ background: "var(--app-brand)" }}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                {prompting ? "Opening…" : "Add to home screen"}
              </button>
            </>
          )}

          <div className="mt-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="tap-44 inline-flex min-h-11 items-center px-1 text-meta-lg font-semibold transition active:opacity-70"
              style={{ color: "var(--app-ink-3)" }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
