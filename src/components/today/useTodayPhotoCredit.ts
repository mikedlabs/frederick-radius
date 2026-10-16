"use client";

import { useEffect, useState } from "react";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { googlePhotoNameFromProxyUrl, isPaidGooglePhotoUrl, publishableGooglePhotoAttribution } from "@/lib/google-photo-policy";

type PhotoInput = { slug: string; photo?: string | null; photoAttribution?: GooglePhotoAttribution | null };
type PhotoContext = { slug: string; raw: string; attribution: GooglePhotoAttribution };
type PhotoResponse = { place?: { slug?: string; google_photo_url?: string; google_photo_attribution?: GooglePhotoAttribution } | null };

function matchedCredit(name: string | undefined, value: unknown): GooglePhotoAttribution | undefined {
  if (!name || !value || typeof value !== "object") return undefined;
  const credit = value as GooglePhotoAttribution;
  if (!Array.isArray(credit.authors)) return undefined;
  return publishableGooglePhotoAttribution(name, [credit]);
}

/** Use the same reviewed map-card source as PlanStopPhoto. Only the visible
 * brief answer may hydrate a missing credit; no catalog-wide request fan-out.
 * A source credit never marks the image itself healthy. */
export function useTodayPhotoCredit(place: PhotoInput, hydrate: boolean) {
  const raw = place.photo;
  const slug = place.slug;
  const isProxy = Boolean(raw && (raw === "/api/place-photo" || raw.startsWith("/api/place-photo?")));
  const name = isProxy && raw ? googlePhotoNameFromProxyUrl(raw) : undefined;
  const supplied = matchedCredit(name, place.photoAttribution);
  const [context, setContext] = useState<PhotoContext | null>(null);
  const hydrated = context?.slug === slug && context.raw === raw ? context.attribution : undefined;
  const credit = supplied ?? hydrated;

  useEffect(() => {
    if (!hydrate || !raw || !name || !isProxy || supplied) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    fetch(`/api/places/map-card/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<PhotoResponse> : null)
      .then((body) => {
        if (controller.signal.aborted || body?.place?.slug !== slug || googlePhotoNameFromProxyUrl(body.place.google_photo_url ?? "") !== name) return;
        const attribution = matchedCredit(name, body.place.google_photo_attribution);
        if (attribution) setContext({ slug, raw, attribution });
      })
      .catch(() => { /* The real place and its hours remain useful without a photo. */ })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [hydrate, raw, slug, name, isProxy, supplied]);

  return { credit, isProxy, allowed: Boolean(raw && (isProxy ? credit : !isPaidGooglePhotoUrl(raw))) };
}
