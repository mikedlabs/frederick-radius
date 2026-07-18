"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary. Unlike (app)/error.tsx (which catches failures INSIDE a
 * route segment, with the root layout still mounted), global-error.tsx catches
 * a crash in the ROOT LAYOUT itself — fonts, providers, analytics — so without
 * it those crashes have no Sentry-instrumented boundary and the user gets the
 * bare Next fallback.
 *
 * Because it REPLACES the root layout, it must render its own <html>/<body>,
 * and globals.css (imported by the root layout) is NOT loaded here — so the
 * brand tokens (var(--app-*)) are unavailable and we fall back to literal brand
 * hex inline. This file is the documented exception to the "tokens only" rule.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#EEE6D4",
          color: "#16140E",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#6b6453",
          }}
        >
          Application error
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          Frederick Radius could not load.
        </h1>
        <p style={{ margin: 0, maxWidth: 360, fontSize: 14, lineHeight: 1.5, color: "#3a352b" }}>
          Something failed while loading this page. Try loading it again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 4,
            border: "none",
            borderRadius: 999,
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: "#E14328",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
