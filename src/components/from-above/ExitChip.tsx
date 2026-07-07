"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * ExitChip — the persistent way back into the app from the two
 * full-bleed From Above experiences (the book at /from-above/preview,
 * the scrubber at /from-above/time-machine). Both live OUTSIDE the
 * (app) route group so neither carries TopBar/BottomNav; without this
 * chip the only way out is browser chrome (QW-12).
 *
 * Styled after the book's chapter chip (pill, blur, quiet type) so it
 * reads as part of the experience's chrome, with a light variant that
 * uses the app tokens for the time machine's daylight map. Prefers
 * real history; falls back to /today (the front door, same rule as
 * TopBar's back button) on a cold deep link.
 */
export default function ExitChip({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/today");
    }
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back to Frederick Radius"
      className={`tap-44 absolute left-[max(env(safe-area-inset-left),16px)] top-[max(env(safe-area-inset-top),16px)] z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium tracking-wide backdrop-blur-md transition ${
        dark
          ? "bg-black/40 text-white/85 hover:bg-black/55"
          : "border"
      }`}
      style={
        dark
          ? undefined
          : {
              borderColor: "var(--app-border)",
              background: "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)",
              color: "var(--app-ink)",
              boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
            }
      }
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      Back
    </button>
  );
}
