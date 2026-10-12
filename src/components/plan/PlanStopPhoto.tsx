"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { PlanStop } from "@/lib/integrations/planner";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { googlePhotoNameFromProxyUrl, isPaidGooglePhotoUrl, publishableGooglePhotoAttribution } from "@/lib/google-photo-policy";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import EventImageAttribution from "@/components/event/EventImageAttribution";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import styles from "./PlanBuilder.module.css";

type PhotoContext = { slug: string; raw: string; attribution: GooglePhotoAttribution };
type MapPhotoResponse = { place?: { slug?: string; google_photo_url?: string; google_photo_attribution?: GooglePhotoAttribution } | null };
function matchedCredit(photoName: string | undefined, value: unknown): GooglePhotoAttribution | undefined {
  if (!photoName || !value || typeof value !== "object") return undefined;
  const credit = value as GooglePhotoAttribution;
  if (!Array.isArray(credit.authors)) return undefined;
  return publishableGooglePhotoAttribution(photoName, [credit]);
}

/** A large, actual stop photograph. Google author/source data is hydrated
 * from the same reviewed snapshot as the map, not from a paid provider call.
 * A photo stays hidden until its exact resource has publishable attribution. */
export default function PlanStopPhoto({ stop }: { stop: PlanStop }) {
  const raw = stop.photo_url;
  const slug = stop.place?.slug;
  const isProxy = Boolean(raw && (raw === "/api/place-photo" || raw.startsWith("/api/place-photo?")));
  const photoName = isProxy && raw ? googlePhotoNameFromProxyUrl(raw) : undefined;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [photoContext, setPhotoContext] = useState<PhotoContext | null>(null);
  const provided = stop.place && "google_photo_attribution" in stop.place ? stop.place.google_photo_attribution : undefined;
  const providedCredit = matchedCredit(photoName, provided);
  const eventCredit = raw && stop.event?.hero_image === raw ? stop.event?.hero_image_attribution : undefined;
  const hydratedCredit = photoContext && raw && slug && photoContext.slug === slug && photoContext.raw === raw ? photoContext.attribution : undefined;
  const credit = providedCredit ?? hydratedCredit;

  useEffect(() => {
    if (!raw || !slug || !photoName || !isProxy || providedCredit || eventCredit || failedSrc === raw) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    fetch(`/api/places/map-card/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<MapPhotoResponse> : null)
      .then((body) => {
        if (controller.signal.aborted || body?.place?.slug !== slug || googlePhotoNameFromProxyUrl(body.place.google_photo_url ?? "") !== photoName) return;
        const attribution = matchedCredit(photoName, body.place.google_photo_attribution);
        if (attribution) setPhotoContext({ slug, raw, attribution });
      })
      .catch(() => { /* Keep the actual stop details when photo credits cannot be resolved. */ })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [raw, slug, photoName, isProxy, providedCredit, eventCredit, failedSrc]);

  if (!raw || failedSrc === raw || (isPaidGooglePhotoUrl(raw) && !isProxy) || (isProxy && !credit && !eventCredit)) return null;
  let src = proxyPhotoAtWidth(raw, 640);
  if (isProxy) {
    const url = new URL(src, "https://frederickradius.local");
    url.searchParams.set("fallback", "signal");
    src = `${url.pathname}?${url.searchParams.toString()}`;
  }
  return <>
    <div className={styles.photo} data-plan-stop-photo>
      <Image src={src} alt="" fill sizes="(min-width: 800px) 500px, calc(100vw - 72px)"
        unoptimized={isProxy} placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
        onLoad={(event) => { if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) setFailedSrc(raw); }}
        onError={() => setFailedSrc(raw)} />
    </div>
    {eventCredit && <EventImageAttribution attribution={eventCredit} compact className="px-4 pt-2" />}
    {isProxy && !eventCredit && credit && <div className="px-4 pt-2"><GooglePhotoAttributionLine attribution={credit} compact touchTarget /></div>}
  </>;
}
