"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * Native share on supported platforms (mobile Safari, mobile Chrome, etc.)
 * Falls back to clipboard copy with a "Link copied" confirmation pill.
 */
export default function ShareButton({
  title,
  text,
  url,
  className,
}: {
  title: string;
  text?: string;
  url: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    haptic("medium");
    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const shareData: ShareData = { title, text, url: fullUrl };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled — silently no-op
        return;
      }
    }

    // Fallback: clipboard
    try {
      await navigator.clipboard.writeText(fullUrl);
      haptic("success");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Last resort: prompt user to copy
      // eslint-disable-next-line no-alert
      window.prompt("Copy this link:", fullUrl);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center gap-1 text-xs font-medium transition active:scale-95"
      }
      style={{ color: "var(--app-ink-3)" }}
      aria-label={`Share ${title}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden style={{ color: "var(--app-positive)" }} />
          <span style={{ color: "var(--app-positive)" }}>Link copied</span>
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Share
        </>
      )}
    </button>
  );
}
