"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";
import { haptic } from "@/lib/haptics";

const SHARE_RESET_MS = 2_000;

export function fairShareUrl(origin: string): string {
  return new URL(FAIR_DAY_PATH, origin).toString();
}

export default function FairShareButton() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const confirmCopied = () => {
    haptic("success");
    setCopied(true);
    toast.success("Fair guide link copied.");
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setCopied(false);
      resetTimer.current = null;
    }, SHARE_RESET_MS);
  };

  const copyLink = async (url: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      confirmCopied();
    } catch {
      window.prompt("Copy this Fair guide link:", url);
    }
  };

  const share = async () => {
    haptic("light");
    const url = fairShareUrl(window.location.origin);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Radius at the Fair",
          text: "Plan the Great Frederick Fair with the program, map, parking, transit, and My Day in one place.",
          url,
        });
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    await copyLink(url);
  };

  return (
    <span className="inline-flex shrink-0">
      <button
        type="button"
        onClick={share}
        data-fair-share
        className="tap-44 inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-[12px] font-extrabold transition-[background-color,color,transform] active:scale-[0.97] motion-reduce:transition-none"
        style={{
          borderColor:
            "color-mix(in srgb, var(--app-brand) 34%, var(--app-border))",
          background:
            "color-mix(in srgb, var(--app-brand) 8%, var(--app-bg-elevated-solid))",
          color: copied ? "var(--app-positive)" : "var(--app-brand-press)",
        }}
        aria-label={copied ? "Fair guide link copied" : "Share the Fair guide"}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{copied ? "Copied" : "Share"}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Fair guide link copied." : ""}
      </span>
    </span>
  );
}
