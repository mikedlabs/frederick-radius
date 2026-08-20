"use client";

import { useEffect, useRef, useState } from "react";
import { mapListPhotoLoader } from "@/components/map/map-list-photo-loader";

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
 * shortcut: that route runs the full server loader, so the photo-suppression
 * de-twin (PHOTO_SUPPRESS) and OV_PATCH.clearPhoto verdicts keep applying. A
 * suppressed record answers "no photo" here exactly as it does everywhere
 * else — resolving photos any other way would quietly hand those records
 * their wrong photo back.
 *
 * Contract: `undefined` = not yet known (caller shows its fallback quietly),
 * string = photo URL, null = asked and there is none (fallback is the honest
 * final state). Requests batch through the shared loader and only fire once
 * the row is near the viewport.
 */
export function usePlacePhoto(
  slug: string,
  inline: string | null | undefined,
  enabled: boolean,
): { photoUrl: string | null | undefined; anchorRef: React.RefObject<HTMLDivElement | null> } {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null | undefined>(() =>
    inline != null && inline.length > 0
      ? inline
      : enabled
        ? mapListPhotoLoader.peek(slug)
        : null,
  );

  useEffect(() => {
    if (!enabled || photoUrl !== undefined) return;

    let active = true;
    let started = false;
    const hydrate = () => {
      if (started) return;
      started = true;
      void mapListPhotoLoader.load(slug).then((photo) => {
        if (active) setPhotoUrl(photo);
      });
    };

    const anchor = anchorRef.current;
    if (!anchor || typeof IntersectionObserver === "undefined") {
      hydrate();
      return () => {
        active = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        hydrate();
      },
      // Same look-ahead MapList uses: far enough that a normal scroll never
      // catches an empty box, near enough that a fast fling does not fetch
      // the whole county.
      { rootMargin: "180px 0px" },
    );
    observer.observe(anchor);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled, photoUrl, slug]);

  return { photoUrl, anchorRef };
}
