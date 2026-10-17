"use client";

import { useEffect, useRef, useState } from "react";
import { mapListPhotoLoader, type PlacePhotoData } from "@/components/map/map-list-photo-loader";

/**
 * Lazy place-photo hydration for list surfaces, extracted from MapList's
 * per-row pattern so /open-now and /nearby can share it.
 *
 * Why lists stopped inlining photo URLs at all: each Google photo token is
 * ~700 bytes of incompressible base64, so serializing one per row dominated
 * the wire size of the county-scale surfaces — measured 2026-08-19, the
 * tokens were ~64% of /nearby's brotli transfer (1,018 rows) and removing
 * /open-now's 800 shrank that document by 88%. Almost none of them were ever
 * painted: bare /nearby paints zero photos, /open-now paints ~30 of 770.
 *
 * Why hydration goes through /api/places/by-slugs rather than a slug→photo
 * shortcut: that route restores the exact primary source/author credit and applies
 * current photo suppression plus clearPhoto/clearEnrichment overrides. A
 * suppressed record answers "no photo" here exactly as it does everywhere
 * else — resolving photos any other way would quietly hand those records
 * their wrong photo back.
 *
 * Contract: `undefined` = not yet known (caller shows its fallback quietly),
 * string = photo URL, null = asked and there is none (fallback is the honest
 * final state). Requests batch through the shared loader and only fire once
 * the row is near the viewport.
 */
/** Source-aware version for cards that render individual photo credits. */
export function usePlacePhotoData(
  slug: string,
  enabled: boolean,
): { photoData: PlacePhotoData | null | undefined; anchorRef: React.RefObject<HTMLDivElement | null> } {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState<{ slug: string; data: PlacePhotoData | null } | null>(null);
  // A recycled row must never paint the previous place's image or credit,
  // including the render before its next effect runs.
  const photoData = !enabled ? null : hydrated?.slug === slug
    ? hydrated.data
    : mapListPhotoLoader.peekData(slug);

  useEffect(() => {
    if (!enabled || photoData !== undefined) return;

    let active = true;
    let started = false;
    const hydrate = () => {
      if (started) return;
      started = true;
      void mapListPhotoLoader.loadData(slug).then((data) => {
        if (active) setHydrated({ slug, data });
      });
    };

    const anchor = anchorRef.current;
    if (!anchor || typeof IntersectionObserver === "undefined") {
      hydrate();
      return () => { active = false; };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        hydrate();
      },
      { rootMargin: "180px 0px" },
    );
    observer.observe(anchor);
    return () => { active = false; observer.disconnect(); };
  }, [enabled, photoData, slug]);

  return { photoData, anchorRef };
}

/** Compatibility for compact URL-only consumers; shares the same batch. */
export function usePlacePhoto(
  slug: string,
  inline: string | null | undefined,
  enabled: boolean,
): { photoUrl: string | null | undefined; anchorRef: React.RefObject<HTMLDivElement | null> } {
  const inlinePhoto = inline?.trim() || null;
  const { photoData, anchorRef } = usePlacePhotoData(slug, enabled && !inlinePhoto);
  return {
    photoUrl: inlinePhoto ?? (enabled ? (photoData === undefined ? undefined : photoData?.google_photo_url ?? null) : null),
    anchorRef,
  };
}
