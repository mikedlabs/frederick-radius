"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ScannerTimeline — embeds the Frederick Scanner Twitter/X timeline
 * inside a styled card matching the rest of /pulse.
 *
 * The widget is heavy (loads platform.twitter.com's widgets.js plus
 * an iframe per timeline), so we:
 *   1. Load widgets.js exactly once per page, asynchronously.
 *   2. Hand the rendered timeline back to a height-bounded box so
 *      the iframe can't grow unbounded.
 *   3. Detect that the widget actually rendered (probes for an
 *      iframe inside the container after mount). If it doesn't —
 *      Twitter/X blocked, rate-limited, or the handle changed —
 *      fall back to a clean "open on X" link card.
 *
 * The handle is a constant so the user can swap it in one line if
 * the real Frederick Scanner account is on a different name.
 */

// Confirmed handle (owner-verified 2026-05-28): @FredScanner.
//   https://x.com/FredScanner
const SCANNER_HANDLE = "FredScanner";

declare global {
  interface Window {
    twttr?: { widgets?: { load?: (el?: HTMLElement) => void } };
  }
}

export default function ScannerTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    function loadScript(): Promise<void> {
      if (window.twttr?.widgets?.load) return Promise.resolve();
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="platform.twitter.com/widgets.js"]',
      );
      if (existing) {
        return new Promise((resolve) => {
          existing.addEventListener("load", () => resolve(), { once: true });
        });
      }
      return new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = "https://platform.twitter.com/widgets.js";
        s.async = true;
        s.charset = "utf-8";
        s.onload = () => resolve();
        s.onerror = () => resolve(); // still resolve; we'll fall back
        document.head.appendChild(s);
      });
    }

    (async () => {
      await loadScript();
      if (cancelled) return;
      if (containerRef.current && window.twttr?.widgets?.load) {
        window.twttr.widgets.load(containerRef.current);
      }
      // After a reasonable window, check whether the widget actually
      // rendered an iframe. If not, surface the fallback.
      window.setTimeout(() => {
        if (cancelled) return;
        const iframe = containerRef.current?.querySelector("iframe");
        setRendered(Boolean(iframe));
      }, 4000);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden"
      style={{
        // Bound the timeline height so it never dominates the page.
        // Internal iframe scrolls if it's taller.
        maxHeight: 540,
      }}
    >
      {/* Twitter's widgets.js converts this anchor into an iframe.
          theme=light blends with the paper-cream surface; chrome
          flags strip Twitter's header/footer so only the tweets
          render. */}
      <a
        className="twitter-timeline"
        data-height="540"
        data-theme="light"
        data-chrome="nofooter noheader noborders transparent"
        href={`https://twitter.com/${SCANNER_HANDLE}`}
      >
        Live tweets from @{SCANNER_HANDLE}
      </a>

      {rendered === false && (
        <div
          className="rounded-[var(--app-radius-md)] border p-4 text-[13px] leading-relaxed"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
            color: "var(--app-ink-2)",
          }}
        >
          The Twitter timeline isn&rsquo;t loading right now (X
          frequently rate-limits embedded widgets).{" "}
          <a
            href={`https://twitter.com/${SCANNER_HANDLE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            Open @{SCANNER_HANDLE} on X
          </a>
          .
        </div>
      )}
    </div>
  );
}
