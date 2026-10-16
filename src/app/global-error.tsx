"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { BRAND } from "@/lib/brand";

/**
 * Root error boundary. Unlike (app)/error.tsx (which catches failures INSIDE a
 * route segment, with the root layout still mounted), global-error.tsx catches
 * a crash in the ROOT LAYOUT itself — fonts, providers, analytics — so without
 * it those crashes have no Sentry-instrumented boundary and the user gets the
 * bare Next fallback.
 *
 * Because it REPLACES the root layout, it must render its own <html>/<body>,
 * and globals.css (imported by the root layout) is NOT loaded here — so the
 * app tokens (var(--app-*)) are unavailable. Its small local palette reads
 * from the same brand contract and honors the OS appearance independently.
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
          :root {
            color-scheme: light;
            --radius-error-bg: ${BRAND.colors.cream};
            --radius-error-ink: ${BRAND.colors.ink};
            --radius-error-muted: ${BRAND.colors.mutedInk};
            --radius-error-focus: ${BRAND.colors.brick};
          }
          @media (prefers-color-scheme: dark) {
            :root {
              color-scheme: dark;
              --radius-error-bg: ${BRAND.colors.darkCanvas};
              --radius-error-ink: ${BRAND.colors.darkInk};
              --radius-error-muted: ${BRAND.colors.darkMutedInk};
              --radius-error-focus: ${BRAND.colors.darkLink};
            }
          }
          button:focus-visible {
            outline: 3px solid var(--radius-error-focus);
            outline-offset: 4px;
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
          background: "var(--radius-error-bg)",
          color: "var(--radius-error-ink)",
          fontFamily: BRAND.type.productStack,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--radius-error-muted)",
          }}
        >
          Application error
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 650,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          Frederick Radius could not load.
        </h1>
        <p style={{ margin: 0, maxWidth: 360, fontSize: 14, lineHeight: 1.5, color: "var(--radius-error-muted)" }}>
          Something failed while loading this page. Try loading it again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 4,
            border: "none",
            borderRadius: 12,
            minHeight: 44,
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 600,
            color: BRAND.colors.surface,
            background: BRAND.colors.brick,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
