"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * Native share on supported platforms (mobile Safari, mobile Chrome, etc.).
 *
 * When `imageUrl` is supplied (a generated /api/og?...&format=story card),
 * we fetch it and share it as an image FILE — which makes the mobile share
 * sheet offer Instagram (Stories / feed), Facebook, Messages, etc. That's
 * the organic-growth play: every share goes out as a branded card, not a
 * bare link. Falls back to a URL share, then clipboard, on anything that
 * can't share files.
 */
export default function ShareButton({
  title,
  text,
  url,
  imageUrl,
  className,
}: {
  title: string;
  text?: string;
  url: string;
  /** A shareable image (e.g. `/api/og?type=event&slug=…&format=story`).
   *  When present and the platform can share files, the card image is
   *  shared instead of the bare link. */
  imageUrl?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    haptic("medium");
    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;

    // 1) Image-file share — surfaces Instagram/Facebook/Stories on mobile.
    if (
      imageUrl &&
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function"
    ) {
      try {
        const abs = imageUrl.startsWith("http")
          ? imageUrl
          : `${window.location.origin}${imageUrl}`;
        const res = await fetch(abs);
        if (res.ok) {
          const blob = await res.blob();
          const name =
            title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) ||
            "frederick-radius";
          const file = new File([blob], `${name}.png`, {
            type: blob.type || "image/png",
          });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title, text, url: fullUrl });
            return;
          }
        }
      } catch {
        // fall through to the URL share below
      }
    }

    // 2) URL share.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch {
        // user cancelled — silently no-op
        return;
      }
    }

    // 3) Clipboard fallback.
    try {
      await navigator.clipboard.writeText(fullUrl);
      haptic("success");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
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
