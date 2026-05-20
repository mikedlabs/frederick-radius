"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

/**
 * Sets a single CSS variable (`--section-accent`) on a wrapper element
 * based on the current top-level route, so every SectionHeading on
 * that page picks up the page's identity color without per-component
 * wiring.
 *
 * The accent is purely decorative — it tints the section tick and any
 * SectionHeading CTA. It does NOT replace `--app-brand` (which is for
 * the single primary CTA per screen — that stays brick everywhere).
 */
const ROUTE_ACCENTS: Record<string, string> = {
  "/today": "var(--app-brand)",   // warm — daily landing
  "/radius": "var(--app-cool)",   // civic blue — the signature interaction
  "/map": "var(--app-cool)",      // civic blue
  "/events": "var(--app-brand)",  // warm — culture
  "/plan": "var(--app-brand-2)",  // catoctin green — outdoors-leaning
  "/saved": "var(--app-cool)",    // civic blue
  "/search": "var(--app-cool)",
  "/pulse": "var(--app-cool)",
  "/m": "var(--app-brand-2)",     // municipalities — green
  "/parks": "var(--app-brand-2)",
  "/trails": "var(--app-brand-2)",
  "/trail": "var(--app-brand-2)",
  "/water": "var(--app-cool)",
  "/transit": "var(--app-cool)",
  "/art": "#7E2C6F",              // arts purple
  "/historic": "var(--app-accent)", // harvest gold — heritage
  "/markets": "var(--app-accent)",
  "/amenities": "var(--app-ink-2)",
  "/category": "var(--app-cool)",
};

export default function RouteAccent({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/today";
  // Match by longest prefix so /events/[slug] still resolves to /events.
  const matched =
    Object.keys(ROUTE_ACCENTS)
      .sort((a, b) => b.length - a.length)
      .find((p) => path === p || path.startsWith(p + "/")) ?? "/today";
  const accent = ROUTE_ACCENTS[matched];
  return (
    <div
      className="contents"
      style={{ "--section-accent": accent } as CSSProperties}
    >
      {children}
    </div>
  );
}
