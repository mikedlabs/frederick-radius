"use client";

import { useMemo, type ReactNode } from "react";
import type { PlaceCardData } from "@/lib/loaders/places";
import { usePlaceSheet } from "./PlaceSheetProvider";

function placeSlugFromHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;
  const match = /^\/places\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;

  try {
    const slug = decodeURIComponent(match[1]).trim();
    return slug && !slug.includes("/") ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Progressively enhance real place-detail anchors into the shared PlaceSheet.
 *
 * A normal primary click opens in place. The anchor remains the source of
 * truth for long-press, copy-link, modified clicks, new tabs, and the
 * canonical-page fallback when an on-demand lookup cannot resolve the slug.
 */
export default function PlaceSheetBoundary({
  places = [],
  fetchMissing = false,
  children,
  className,
}: {
  /** Places already present in a client payload can open immediately. */
  places?: PlaceCardData[];
  /** Lean surfaces can fetch only the place the visitor actually taps. */
  fetchMissing?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { openSheet, openSheetBySlug } = usePlaceSheet();
  const bySlug = useMemo(
    () => new Map(places.map((place) => [place.slug, place])),
    [places],
  );

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href^="/places/"]');
    if (
      !anchor ||
      (anchor.target && anchor.target !== "_self") ||
      anchor.hasAttribute("download") ||
      anchor.getAttribute("aria-disabled") === "true"
    ) {
      return;
    }

    const href = anchor.getAttribute("href");
    const slug = href ? placeSlugFromHref(href) : null;
    if (!slug) return;
    const place = bySlug.get(slug);
    if (!place && !fetchMissing) return;

    event.preventDefault();
    event.stopPropagation();
    if (place) openSheet(place, { returnFocus: anchor });
    else openSheetBySlug(slug, { returnFocus: anchor });
  };

  return (
    <div onClickCapture={onClickCapture} className={className}>
      {children}
    </div>
  );
}
