"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Sets a single CSS variable (`--section-accent`) on a wrapper element
 * based on the current top-level route, so every SectionHeading on
 * that page picks up the page's identity color without per-component
 * wiring.
 *
 * The accent is purely decorative — it tints the section tick, any
 * SectionHeading CTA, and the PageBloom `single` variant. It does NOT
 * replace `--app-brand` (which is for the single primary CTA per
 * screen — that stays brick everywhere).
 *
 * Special case: /category/[slug] resolves to the category's own brand
 * color (coffee → brown, outdoors → green, arts → purple, etc.) so a
 * coffee category page actually feels like coffee, not generic blue.
 * Stranger-clarity move: the accent ties the page heading, top picks
 * rail, and PageBloom orbs into the same chromatic story the rest of
 * the design system already speaks.
 */
const ROUTE_ACCENTS: Record<string, string> = {
  "/today": "var(--app-brand)",     // warm — daily landing
  "/map": "var(--app-cool)",   // civic blue — the spatial tab
  "/radius": "var(--app-cool)",   // still routable; deep links survive
  "/browse": "var(--app-cool)",   // legacy — 301'd to /map but tinted
                                  // so a stale link's pre-redirect
                                  // render still feels on-brand
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
  // /category is handled specially below — falls back to --app-cool
  // only when the slug doesn't match a known category.
  "/category": "var(--app-cool)",
};

/**
 * Pull the category slug out of a /category/[slug] path. Returns null
 * for the bare /category index or any non-category route. Strips a
 * trailing segment too so /category/coffee/anything still resolves.
 */
function categorySlugFromPath(path: string): string | null {
  if (!path.startsWith("/category/")) return null;
  const rest = path.slice("/category/".length);
  if (!rest) return null;
  const slug = rest.split("/")[0];
  return slug || null;
}

export default function RouteAccent({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/today";

  // /category/[slug]: use the category's own color when known. A
  // recognized child wins over the generic /category fallback.
  const catSlug = categorySlugFromPath(path);
  const catColor = catSlug ? CATEGORY_BY_SLUG[catSlug]?.color : undefined;

  // Match by longest prefix so /events/[slug] still resolves to /events.
  const matched =
    Object.keys(ROUTE_ACCENTS)
      .sort((a, b) => b.length - a.length)
      .find((p) => path === p || path.startsWith(p + "/")) ?? "/today";

  const accent = catColor ?? ROUTE_ACCENTS[matched];
  return (
    <div
      className="contents"
      style={{ "--section-accent": accent } as CSSProperties}
    >
      {children}
    </div>
  );
}
