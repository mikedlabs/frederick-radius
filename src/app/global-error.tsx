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
      <head>
        <style>{`
          @font-face {
            font-family: "Public Sans Variable";
            src: url("/brand/fonts/public-sans-variable.woff2") format("woff2");
            font-style: normal;
            font-weight: 100 900;
            font-display: swap;
          }
          @font-face {
            font-family: "Libre Caslon Display";
            src: url("/brand/fonts/libre-caslon-display-400.woff2") format("woff2");
            font-style: normal;
            font-weight: 400;
            font-display: swap;
          }
        `}</style>
      </head>
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
          background: "#F4EEE2",
          color: "#221C15",
          fontFamily:
            "'Public Sans Variable', 'Public Sans', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#6C6357",
          }}
        >
          Application error
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            fontFamily: "'Libre Caslon Display', Georgia, serif",
          }}
        >
          Frederick Radius could not load.
        </h1>
        <p style={{ margin: 0, maxWidth: 360, fontSize: 14, lineHeight: 1.5, color: "#5A5348" }}>
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
            color: "#F4EEE2",
            background: "#B5462B",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
