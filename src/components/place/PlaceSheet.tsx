"use client";

import { useEffect, useState, type RefObject } from "react";
import { ExternalLink, Phone, Mail, Globe, Navigation, Expand, ChevronDown, ChevronRight, MapPin, Instagram, Footprints, Car, UtensilsCrossed, ShoppingBag, ParkingCircle, BookOpen } from "lucide-react";
import {
  groupPlaceActions,
  placeActions,
  type PlaceAction,
  type PlaceActionGroups,
} from "@/lib/place-actions";
import Link from "next/link";
import Image from "next/image";
import { haptic } from "@/lib/haptics";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import OpenClosedDot from "./OpenClosedDot";
import GoogleHours from "./GoogleHours";
import SaveButton from "@/components/saved/SaveButton";
import ShareButton from "./ShareButton";
import SourceBadge from "./SourceBadge";
import FieldNotesCard from "./FieldNotesCard";
import type { PlaceCardData } from "@/lib/loaders/places";
import TrustChip from "@/components/ui/TrustChip";
import FreshnessChip from "@/components/ui/FreshnessChip";
import { placeHoursTrust, formatChecked } from "@/lib/trust";
import { knownFor } from "@/lib/cuisine";
import { classifyDescription } from "@/lib/copy-quality";
import { formatDistance } from "@/lib/geo";
import type { LngLat } from "@/lib/geo";
import { nearestAerial, currentSeason } from "@/lib/aerial";
import PhotoLightbox from "@/components/ui/PhotoLightbox";
import {
  GooglePhotoAttributionLine,
  googlePhotoAttributionForUrl,
} from "@/components/place/GoogleAttribution";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import LiveGooglePlaceContext, { type LiveGooglePlaceData } from "@/components/place/GooglePlaceContext";
import {
  loadLivePlaceHours,
  subscribeLivePlaceHours,
} from "@/components/place/livePlaceHours";
import PlaceDescriptionCredit from "@/components/place/PlaceDescriptionCredit";
import { normalizeMapReturnTo, withMapReturnTo } from "@/lib/map-return";
import PlaceCommunicationAccess from "@/components/place/PlaceCommunicationAccess";
import {
  decisionContextFromPath,
  trackDecision,
  type DecisionAction,
} from "@/lib/decision/telemetry";

/**
 * Bottom-sheet detail view for a place. The presence/drag/focus/exit
 * machinery lives in the shared BottomSheet shell (app-like pass,
 * phase 2) so every sheet in the app behaves identically; this file
 * owns only the place CONTENT.
 *
 * Trigger: PlaceCardLink or any consumer calls openPlaceSheet(place)
 * via the context provided by PlaceSheetProvider.
 */
type Props = {
  place: PlaceCardData | null;
  travelOrigin?: LngLat | null;
  mapReturnTo?: string | null;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  historyLayerId: string;
};

export default function PlaceSheet({
  place,
  travelOrigin,
  mapReturnTo,
  onClose,
  returnFocusRef,
  historyLayerId,
}: Props) {
  return (
    <BottomSheet
      present={Boolean(place)}
      onClose={onClose}
      ariaLabel={place?.name ?? "Place details"}
      historyLayerId={historyLayerId}
      returnFocusRef={returnFocusRef}
    >
      {(dismiss) => place && (
        <PlaceSheetContent
          key={place.slug}
          place={place}
          travelOrigin={travelOrigin}
          mapReturnTo={mapReturnTo}
          onClose={dismiss}
        />
      )}
    </BottomSheet>
  );
}

function PlaceSheetContent({
  place,
  travelOrigin,
  mapReturnTo,
  onClose,
}: {
  place: PlaceCardData;
  travelOrigin?: LngLat | null;
  mapReturnTo?: string | null;
  onClose: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const muni = MUNICIPALITY_BY_SLUG[place.municipality];
  const color = cat?.color ?? "var(--app-brand)";
  // The sheet mounts only after a client interaction, so its lazy initializer
  // can read the live address bar. That is more precise than a router snapshot:
  // the map writes camera movement and layers through `history.replaceState`.
  const [fullPageHref] = useState(() => {
    const current =
      typeof window === "undefined" ? null : new URL(window.location.href);
    const liveMapReturnTo = normalizeMapReturnTo(
      current?.pathname === "/map"
        ? `${current.pathname}${current.search}${current.hash}`
        : mapReturnTo,
    );
    return withMapReturnTo(`/places/${place.slug}`, liveMapReturnTo);
  });

  // Real walk/drive time from a fresh, consented device location. Without an
  // origin, silence is more useful than a plausible-looking downtown proxy.
  const travelOriginKey = travelOrigin
    ? `${travelOrigin.lat.toFixed(5)},${travelOrigin.lng.toFixed(5)}`
    : null;
  const [travelResult, setTravelResult] = useState<{
    originKey: string;
    walkMin?: number;
    driveMin?: number;
  } | null>(null);
  const travel = travelResult?.originKey === travelOriginKey
    ? travelResult
    : null;
  const [travelStatus, setTravelStatus] = useState<
    "idle" | "loading" | "unavailable"
  >("idle");
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const [venueEvents, setVenueEvents] = useState<
    { slug: string; title: string; weekday: string; day: string; month: string; time: string }[]
  >([]);
  const requestTravelTime = async () => {
    if (!travelOrigin || !travelOriginKey || travelStatus === "loading") return;
    setTravelStatus("loading");
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 7_500);
    try {
      // Roughly 100 m precision is sufficient for a walking estimate and
      // avoids sending an unnecessarily exact device fix to the route provider.
      const response = await fetch("/api/travel-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: Number(place.geom.lat.toFixed(5)),
          lng: Number(place.geom.lng.toFixed(5)),
          fromLat: Number(travelOrigin.lat.toFixed(3)),
          fromLng: Number(travelOrigin.lng.toFixed(3)),
        }),
        signal: controller.signal,
      });
      const data = response.ok
        ? await response.json() as { walkMin?: number; driveMin?: number }
        : null;
      if (data && (data.walkMin != null || data.driveMin != null)) {
        setTravelResult({
          originKey: travelOriginKey,
          walkMin: data.walkMin,
          driveMin: data.driveMin,
        });
        setTravelStatus("idle");
      } else {
        setTravelStatus("unavailable");
      }
    } catch {
      setTravelStatus("unavailable");
    } finally {
      globalThis.clearTimeout(timeout);
    }
  };

  // Runtime Google data is requested only after a deliberate tap. Opening a
  // place sheet must remain a free catalog read, even when stored hours are
  // old or the long-tail record has no media/contact enrichment yet.
  const [extra, setExtra] = useState<{
    photos: string[]; hours: string[]; phone?: string; website?: string;
    photo_attributions?: GooglePhotoAttribution[]; google_maps_uri?: string;
  } & LiveGooglePlaceData | null>(null);
  const [photoContext, setPhotoContext] = useState<{
    slug: string;
    google_photo_attribution?: GooglePhotoAttribution;
    google_maps_uri?: string;
  } | null>(null);
  const [currentHoursStatus, setCurrentHoursStatus] = useState<
    "idle" | "loading" | "unavailable"
  >("idle");

  // A current-hours request can also be satisfied by the explicit richer
  // Google-details action below. Listen for either action without starting a
  // request here, then update every hours/status label in this sheet together.
  useEffect(() => {
    if (place.hours_verified) return;
    return subscribeLivePlaceHours(place.slug, (value) => {
      setExtra((current) => ({
        ...current,
        ...value,
        photos: current?.photos ?? [],
        hours: value.hours ?? current?.hours ?? [],
      }));
      setCurrentHoursStatus("idle");
    });
  }, [place.hours_verified, place.slug]);

  const checkCurrentHours = () => {
    if (currentHoursStatus === "loading") return;
    setCurrentHoursStatus("loading");
    loadLivePlaceHours(place.slug)
      .then((value) => {
        if (!value.structured_hours || !value.hours?.length) {
          setCurrentHoursStatus("unavailable");
        }
      })
      .catch(() => setCurrentHoursStatus("unavailable"));
  };

  // Client-safe place rows intentionally omit the large attribution object.
  // Fetch it only for the one photo the user opens, preserving the complete
  // author/source line in the sheet without making every catalog download pay
  // for every business's profile URLs and report metadata.
  useEffect(() => {
    if (!place.google_photo_url || place.google_photo_attribution) return;
    const controller = new AbortController();
    fetch(`/api/places/map-card/${encodeURIComponent(place.slug)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          body: {
            place?: {
              slug?: string;
              google_photo_attribution?: GooglePhotoAttribution;
              google_maps_uri?: string;
            } | null;
          } | null,
        ) => {
          if (body?.place?.slug !== place.slug) return;
          setPhotoContext({
            slug: place.slug,
            google_photo_attribution:
              body.place.google_photo_attribution,
            google_maps_uri: body.place.google_maps_uri,
          });
        },
      )
      .catch(() => {});
    return () => controller.abort();
  }, [
    place.google_photo_attribution,
    place.google_photo_url,
    place.slug,
  ]);

  // Upcoming events happening AT this venue — a strong "should I go" signal.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place/${place.slug}/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.events)) setVenueEvents(d.events); })
      .catch(() => {});
    return () => { cancelled = true; setVenueEvents([]); };
  }, [place.slug]);

  // Static enrichment wins; on-demand fills the gap.
  const photos = place.google_photos?.length
    ? place.google_photos
    : (extra?.photos ?? []);
  const heroUrl = place.google_photo_url ?? photos[0];
  const photoAttributions = place.google_photo_attributions ?? extra?.photo_attributions ?? [];
  const activePhotoContext =
    photoContext?.slug === place.slug ? photoContext : null;
  const heroAttribution =
    place.google_photo_attribution ??
    activePhotoContext?.google_photo_attribution ??
    photoAttributions[0];
  const googleMapsUri =
    place.google_maps_uri ??
    activePhotoContext?.google_maps_uri ??
    extra?.google_maps_uri;
  // Every unique photo (hero first), for the tap-to-enlarge lightbox.
  const allPhotos = Array.from(new Set([heroUrl, ...photos].filter(Boolean))) as string[];
  const lightboxAttributions = allPhotos.map((url) => {
    const attribution = googlePhotoAttributionForUrl(url, photoAttributions) ??
      (url === heroUrl ? heroAttribution : undefined);
    return {
      attribution,
      placeGoogleMapsUri: googleMapsUri,
    };
  });
  const hoursLines = extra?.hours?.length
    ? extra.hours
    : (place.google_hours ?? []);
  const effectiveOpenStatus = extra?.open_status ?? place.open_status;
  const effectiveHoursCheckedAt = extra?.hours_checked_at ?? (
    place.hours_verified ? place.hours_updated_at : undefined
  );
  const effectivePlace = {
    ...place,
    phone: place.phone ?? extra?.phone,
    website: place.website ?? extra?.website,
  };
  const actionGroups = groupPlaceActions(
    placeActions(effectivePlace),
    place.category,
  );

  useEffect(() => {
    const context = decisionContextFromPath(window.location.pathname);
    trackDecision({
      stage: "impression",
      surface: context.surface,
      entityKind: "place",
      entityId: place.slug,
      position: "sheet",
    });
  }, [place.slug]);

  return (
    <>
      <SheetHandle onClose={onClose} closeLabel="Close place details" />

      {/* Scrollable content. The outer motion.div is flex-col with
       *  max-h-[85dvh] + overflow-hidden, so this inner panel is
       *  flex-1 + min-h-0 — that's the standard flex idiom for
       *  letting a child be the actual scroll region. Before this,
       *  the inner had `overflow-y-auto` but no height constraint,
       *  so content past the cap just got clipped — users couldn't
       *  reach the bottom details. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {/* Cinematic hero — full-bleed, 4:3 aspect, with a bottom
         *  gradient that fades the photo into the sheet. The category
         *  eyebrow + place name overlay the gradient so the first
         *  thing the eye reads is "Brewery · Olde Mother Brewing"
         *  on the actual place's photo, not a generic header below it.
         *  When there is no photo, we fall back to a category-tinted
         *  panel with the icon — still cinematic, still on-brand. */}
        {heroUrl ? (
          <>
            <div
              className="relative aspect-[4/3] w-full cursor-zoom-in overflow-hidden"
              role="button"
              tabIndex={0}
              aria-label={`View ${place.name} photos`}
              onClick={() => { haptic("light"); setLightboxAt(0); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); haptic("light"); setLightboxAt(0); } }}
            >
            <Image
              src={heroUrl}
              alt={place.name}
              fill
              unoptimized={heroUrl.startsWith("/api/place-photo")}
              priority
              sizes="(max-width: 720px) 100vw, 720px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.42)", color: "white", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
            >
              <Expand className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.18) 60%, rgba(0,0,0,0.78) 100%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 p-5 pb-4">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{
                  color: `color-mix(in srgb, ${color} 35%, white)`,
                  textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                }}
              >
                {cat?.name ?? place.category}
              </p>
              <h2
                className="mt-1 font-serif text-[24px] font-semibold leading-tight tracking-tight text-white"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
              >
                {place.name}
              </h2>
            </div>
            {/* Save button anchored to the upper-LEFT so it can't collide
             *  with the decorative Expand glyph in the top-right corner
             *  (both were at right-3 top-3 and overlapped). */}
            <div className="absolute left-3 top-3 z-10">
              <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
            </div>
            </div>
            <div className="px-5 pt-1 text-right" style={{ color: "var(--app-ink-3)" }}>
              <GooglePhotoAttributionLine
                attribution={heroAttribution}
                placeGoogleMapsUri={googleMapsUri}
                touchTarget
              />
            </div>
          </>
        ) : (
          <div className="px-5 pt-2">
            <div
              aria-hidden
              className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[var(--app-radius-lg)]"
              style={{
                background: `radial-gradient(140% 120% at 25% 20%, ${color}55, ${color}15 70%)`,
                color,
              }}
            >
              <MapPin className="h-16 w-16 opacity-70" strokeWidth={1.25} />
            </div>
          </div>
        )}

        {/* Below-hero content lives inside the standard padding. */}
        {/* reveal-up: same settle-in cascade as the event sheet. */}
        <div className="reveal-up px-5 pt-4">
          {/* Title row only appears when there is NO photo — when a
           *  photo exists the name is overlaid above. We still surface
           *  the category eyebrow + name here for the photoless case
           *  so the sheet always has a clear identity. */}
          {!heroUrl && (
            <header className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
                  {cat?.name ?? place.category}
                </p>
                <h2 className="font-serif text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {place.name}
                </h2>
              </div>
              <div className="shrink-0">
                <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
              </div>
            </header>
          )}

          {/* Address + source provenance + "known for" — three quiet
           *  lines that establish what this place is before the data
           *  rows below. SourceBadge gives provenance at a glance;
           *  knownFor surfaces the curated descriptor when we have one
           *  (cuisine, specialty), instead of leaving the eye to skim
           *  the short_blurb cold. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {/* The precise postal city ("Frederick"), not the municipality's
                editorial name ("Downtown Frederick") which overclaims for the
                many City-of-Frederick addresses that aren't downtown. Falls
                back to the municipality only when a place has no clean city. */}
            <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              {place.address}{place.city ? ` · ${place.city}` : muni ? ` · ${muni.name}` : ""}
            </p>
            <SourceBadge place={place} size="sm" />
          </div>
          {(() => {
            const kf = knownFor(place);
            if (!kf) return null;
            // Blurbs usually already end in a sentence stop, so only add
            // our own period when one's missing — otherwise the wrapped
            // "Known for …." sentence doubles up ("…direct-trade beans..").
            const text = kf.replace(/\s+$/, "");
            const withStop = /[.!?]$/.test(text) ? text : `${text}.`;
            return (
              <p
                className="mt-1.5 text-[13px] italic leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                Known for {withStop}
              </p>
            );
          })()}

          {/* Status + rating + price + distance — the at-a-glance
           *  data row. Kept compact so the next block (the trust pill
           *  cluster) reads as a single thought. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--app-ink-2)" }}>
            <OpenClosedDot status={effectiveOpenStatus} />
            {place.google_rating !== undefined && (
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--app-ink-2)" }}>
                <span style={{ color: "var(--app-accent-press)" }}>★</span>
                <span className="font-mono tabular-nums">{place.google_rating.toFixed(1)}</span>
                {place.google_rating_count ? (
                  <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-3)" }}>({place.google_rating_count.toLocaleString()})</span>
                ) : null}
                <span className="text-xs" translate="no" style={{ color: "var(--app-ink-3)" }}>Google Maps</span>
              </span>
            )}
            {place.price_band && (
              <span className="font-mono font-medium" style={{ color: "var(--app-ink-3)" }}>
                {"$".repeat(place.price_band)}
              </span>
            )}
            {place.distance_m !== undefined && (
              <span style={{ color: "var(--app-ink-3)" }}>
                <span className="font-mono tabular-nums">{formatDistance(place.distance_m)}</span> away
              </span>
            )}
          </div>

          {/* Compact trust cluster — TrustChip + verified-by-Google
           *  dot + FreshnessChip, on ONE row separated by middle dots.
           *  The previous layout stacked three tiny rows on top of
           *  each other; this reads as one trust statement. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TrustChip signal={placeHoursTrust(effectiveOpenStatus)} />
            {(place.google_verified || Boolean(extra?.hours_checked_at)) && (
              <>
                <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--app-positive)" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} aria-hidden />
                  Confirmed by Google
                </span>
              </>
            )}
            <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
            <FreshnessChip
              iso={
                effectiveHoursCheckedAt
                  ? effectiveHoursCheckedAt
                  : place.last_verified_at
              }
              subject={effectiveHoursCheckedAt ? "Hours" : "Listing"}
            />
          </div>

          {!place.hours_verified &&
          /^(?:places\/)?ChIJ[A-Za-z0-9_-]+$/.test(place.google_place_id ?? "") &&
          !extra?.hours_checked_at ? (
            <div className="mt-1.5">
              <button
                type="button"
                disabled={currentHoursStatus === "loading"}
                onClick={checkCurrentHours}
                className="tap-44-y inline-flex items-center text-xs font-semibold disabled:opacity-60"
                style={{ color: "var(--app-brand-press)" }}
              >
                {currentHoursStatus === "loading"
                  ? "Checking current hours…"
                  : "Check current hours"}
              </button>
              {currentHoursStatus === "unavailable" ? (
                <p className="text-xs" role="status" style={{ color: "var(--app-ink-3)" }}>
                  Current hours are unavailable. Check the official listing before you go.
                </p>
              ) : null}
            </div>
          ) : null}

        {/* The moat, surfaced where the tap lands: this place's VERIFIED Field
            Notes (happy hour / deal / parking / insider), led high in the sheet
            so the reason-to-open isn't buried on the detail page. Gated by the
            precomputed flag so most places render nothing and leave no gap. */}
        {place.field_notes && (
          <div className="mt-4">
            <FieldNotesCard slug={place.slug} />
          </div>
        )}

        {/* City of Frederick parcel context (zoning / land use / schools /
            election district) was removed from the discovery sheet — it read
            as an institutional data dump, not a "should I visit" signal. When
            the feature activates (COF_PARCELS + City approval) it belongs in a
            dedicated Land-records section on /places/[slug], not this overlay. */}

        {/* Real travel time from the user's consented location (Routes API) */}
        {travel && (travel.walkMin != null || travel.driveMin != null) && (
          <div
            className="mt-3 inline-flex items-center gap-3 rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            {travel.walkMin === 0 ? (
              /* A sub-minute walk should not turn into "0 min." */
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
                You are here
              </span>
            ) : (
              <>
                {/* A walk leg only reads as advice when walking is plausible:
                    skip the degenerate 0 (handled above), and past 35 minutes
                    the drive leg carries the message alone ("498 min walk" is a
                    data readout, not a recommendation — the 2026-06 audit). */}
                {travel.walkMin != null && travel.walkMin >= 1 && travel.walkMin <= 35 && (
                  <span className="inline-flex items-center gap-1">
                    <Footprints className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
                    <span className="font-mono tabular-nums">{travel.walkMin}</span> min walk
                  </span>
                )}
                {travel.driveMin != null && (
                  <span className="inline-flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
                    <span className="font-mono tabular-nums">{travel.driveMin}</span> min drive
                  </span>
                )}
                <span style={{ color: "var(--app-ink-3)" }}>from you</span>
              </>
            )}
          </div>
        )}
        {travelOrigin && !travel && (
          <button
            type="button"
            onClick={() => void requestTravelTime()}
            disabled={travelStatus === "loading"}
            className="tap-44 mt-3 inline-flex items-center gap-2 rounded-full border px-3 text-xs font-semibold disabled:opacity-60"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-ink-2)",
              background: "var(--app-bg-elevated)",
            }}
          >
            <Footprints className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {travelStatus === "loading"
              ? "Checking travel time…"
              : travelStatus === "unavailable"
                ? "Try travel time again"
                : "Check walk and drive time"}
          </button>
        )}

        {/* Blurb — gated by the copy-quality detector so scraped junk
            (phone numbers, contact CTAs, addresses) never shows. */}
        {place.short_blurb && classifyDescription(
          place.name,
          place.short_blurb,
          place.description_reviewed ?? false,
        ) !== "scraped" && (
          <div className="mt-3">
            <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {place.short_blurb}
            </p>
            <PlaceDescriptionCredit
              kind={place.description_source}
              url={place.description_source_url}
              verifiedAt={place.description_verified_at}
            />
          </div>
        )}

        <div className="mt-3">
          <LiveGooglePlaceContext
            key={place.slug}
            slug={place.slug}
            showSummary={!place.short_blurb || classifyDescription(
              place.name,
              place.short_blurb,
              place.description_reviewed ?? false,
            ) === "scraped"}
          />
        </div>

        {place.accessibility?.communication ? (
          <div className="mt-4">
            <PlaceCommunicationAccess place={place} />
          </div>
        ) : null}

        {/* Photo strip — more of what the place actually looks like */}
        {photos.length > 1 && (
          <div className="shelf-rail -mx-1 mt-4 gap-2 px-1 pb-1">
            {photos.slice(1, 8).map((u, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`View ${place.name} photo ${i + 2}`}
                onClick={() => { haptic("light"); setLightboxAt(allPhotos.indexOf(u)); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); haptic("light"); setLightboxAt(allPhotos.indexOf(u)); } }}
                className="relative h-24 w-32 shrink-0 cursor-zoom-in overflow-hidden rounded-[var(--app-radius-md)] border"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Image
                  src={u}
                  alt=""
                  fill
                  unoptimized={u.startsWith("/api/place-photo")}
                  loading="lazy"
                  sizes="128px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* From above — the nearest geotagged drone shot of this block,
            when one genuinely sits close enough to depict it (self-hiding
            via the maxMeters gate, so it never captions a photo as a place
            it isn't). The reliable LOCAL archive, not the dead City ortho.
            Blur-up gives a calm load; honest distance in the caption. */}
        {(() => {
          const aerial = nearestAerial(
            { lng: place.geom.lng, lat: place.geom.lat },
            { maxMeters: 800, preferSeason: currentSeason() },
          );
          if (!aerial) return null;
          const seasonLabel = aerial.season.charAt(0).toUpperCase() + aerial.season.slice(1);
          return (
            <div className="mt-5">
              <h3 className="eyebrow mb-2" style={{ color: "var(--app-ink-3)" }}>From above</h3>
              <figure
                className="relative overflow-hidden rounded-[var(--app-radius-lg)]"
                style={{ boxShadow: "var(--app-edge), var(--app-elev-1)" }}
              >
                <div className="relative aspect-[16/10] w-full bg-[var(--app-bg-sunken)]">
                  <Image
                    src={aerial.src}
                    alt={`${place.name} from above`}
                    fill
                    loading="lazy"
                    sizes="(max-width: 720px) 100vw, 720px"
                    placeholder="blur"
                    blurDataURL={PAPER_CREAM_BLUR}
                    className="object-cover"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.5) 100%)" }}
                  />
                  <figcaption
                    className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-3 text-[11px] font-semibold text-white"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                  >
                    <span>{seasonLabel} from the air</span>
                    <span aria-hidden style={{ opacity: 0.65 }}>·</span>
                    <span style={{ opacity: 0.9 }}>{formatDistance(aerial.distance_m)} from here</span>
                  </figcaption>
                </div>
              </figure>
            </div>
          );
        })()}

        {/* Upcoming events AT this venue — what's on here, not just what it is */}
        {venueEvents.length > 0 && (
          <div className="mt-5">
            <h3 className="eyebrow mb-2" style={{ color: "var(--app-ink-3)" }}>Upcoming here</h3>
            <ul className="flex flex-col gap-1.5">
              {venueEvents.map((ev) => (
                <li key={ev.slug}>
                  <Link
                    href={`/events/${ev.slug}`}
                    onClick={() => haptic("light")}
                    className="tactile flex items-center gap-3 rounded-[var(--app-radius-md)] p-2.5 transition active:scale-[0.99]"
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-sm)]"
                      style={{ background: `color-mix(in srgb, ${color} 13%, var(--app-bg-elevated-solid))`, color }}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-[0.08em] leading-none">{ev.month}</span>
                      <span className="font-serif text-[18px] font-semibold leading-none">{ev.day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{ev.title}</p>
                      <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>{ev.weekday} · {ev.time}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hours from Google */}
        {hoursLines.length > 0 && (
          <div className="mt-4">
            <GoogleHours lines={hoursLines} />
          </div>
        )}

        {/* One reliable lead action, two visible alternatives, and everything
            else behind a calm disclosure. Provider colors no longer flatten
            every capability into an equally loud pill. */}
        <PlaceSheetActions groups={actionGroups} entityId={place.slug} />

        {/* Footer — link to full page + share */}
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs" style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={fullPageHref}
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: "var(--app-brand-press)" }}
          >
            See full page <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
          <ShareButton
            title={place.name}
            text={place.short_blurb}
            url={`/places/${place.slug}`}
            imageUrl={`/api/og?type=place&slug=${place.slug}&format=story`}
          />
        </div>

        {/* Trust footer: a tiny "Updated …" pulse + a "see something
            wrong" escape valve, on the same line. The freshness line
            is the audit-asked "tiny proof point inside the workflow"
            — strangers don't read /trust before they read a place
            card, so the card has to prove itself. formatChecked()
            renders Updated today / yesterday / N days ago / on Mon 12
            and returns null when there's no timestamp, so the line
            silently goes away on places we can't honestly date. */}
        <p
          className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {(() => {
            const checked = formatChecked(place.updated_at);
            return checked ? (
              <>
                <span>{checked}</span>
                <span aria-hidden>·</span>
              </>
            ) : null;
          })()}
          <span>
            See something wrong?{" "}
            <a
              href={`mailto:hello@frederickradius.app?subject=${encodeURIComponent(
                `Suggest an edit: ${place.name} (${place.slug})`,
              )}&body=${encodeURIComponent(
                `What I noticed about ${place.name}:\n\n\n(Optional) where I saw it: `,
              )}`}
              className="underline"
              style={{ color: "var(--app-cool)" }}
            >
              Tell us
            </a>
          </span>
        </p>
        </div>
      </div>

      {lightboxAt !== null && (
        <PhotoLightbox
          photos={allPhotos}
          attributions={lightboxAttributions}
          startIndex={lightboxAt}
          alt={place.name}
          onClose={() => setLightboxAt(null)}
        />
      )}
    </>
  );
}

const ACTION_ICON = {
  directions: Navigation,
  call: Phone,
  email: Mail,
  website: Globe,
  reserve: UtensilsCrossed,
  order: ShoppingBag,
  parking: ParkingCircle,
  instagram: Instagram,
  menu: BookOpen,
} as const;

function decisionActionForPlaceAction(action: PlaceAction): DecisionAction {
  if (action.key === "directions") return "directions";
  if (action.key === "call") return "call";
  if (action.key === "email") return "email";
  if (action.key === "website" || action.key === "instagram") return "website";
  if (action.key === "menu") return "menu";
  if (action.key === "reserve" || action.key === "reserve-search") return "reservation";
  if (action.key === "order" || action.key === "order-search") return "order";
  if (action.key === "parking") return "parking";
  return "open";
}

function PlaceSheetActions({
  groups,
  entityId,
}: {
  groups: PlaceActionGroups;
  entityId: string;
}) {
  const { primary, secondary, more } = groups;
  if (!primary) return null;

  return (
    <section className="mt-5 space-y-2" aria-label="Place actions">
      <PlaceActionLink action={primary} priority="primary" entityId={entityId} />
      {secondary.length > 0 ? (
        <div className={`grid gap-2 ${secondary.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {secondary.map((action) => (
            <PlaceActionLink key={action.key} action={action} priority="secondary" entityId={entityId} />
          ))}
        </div>
      ) : null}
      {more.length > 0 ? (
        <details
          className="group overflow-hidden rounded-[var(--app-radius-md)] border"
          style={{ borderColor: "var(--app-border)" }}
        >
          <summary
            className="tap-44-y flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[12.5px] font-semibold [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--app-ink-2)" }}
          >
            <span>More actions</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {more.length}
              </span>
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180"
                strokeWidth={2.25}
                aria-hidden
              />
            </span>
          </summary>
          <div className="border-t px-3" style={{ borderColor: "var(--app-border)" }}>
            {more.map((action) => (
              <PlaceActionLink key={action.key} action={action} priority="row" entityId={entityId} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function PlaceActionLink({
  action,
  priority,
  entityId,
}: {
  action: PlaceAction;
  priority: "primary" | "secondary" | "row";
  entityId: string;
}) {
  const Icon = ACTION_ICON[action.icon];
  const primary = priority === "primary";
  const row = priority === "row";
  return (
    <a
      href={action.href}
      onClick={() => {
        haptic("light");
        trackDecision({
          stage: "action",
          surface: "place",
          entityKind: "place",
          entityId,
          position: "sheet",
          action: decisionActionForPlaceAction(action),
        });
      }}
      target={action.external ? "_blank" : undefined}
      rel={action.external ? "noopener noreferrer" : undefined}
      className={
        row
          ? "tap-44-y flex min-h-11 items-center gap-2.5 border-b py-2 text-[12.5px] font-semibold last:border-b-0"
          : `tactile-interactive flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-3 text-[12.5px] font-semibold ${
              primary ? "tactile-lift" : "border bg-[var(--app-bg-elevated)]"
            }`
      }
      style={
        row
          ? { borderColor: "var(--app-border)", color: "var(--app-ink)" }
          : primary
            ? {
                background: "var(--app-brand-press)",
                color: "var(--app-on-brand)",
              }
            : {
                borderColor: "var(--app-border-strong)",
                color: "var(--app-ink)",
              }
      }
    >
      <Icon
        className="h-4 w-4 shrink-0"
        strokeWidth={2.1}
        style={{ color: primary ? "var(--app-on-brand)" : "var(--app-brand-press)" }}
        aria-hidden
      />
      <span className={row ? "min-w-0 flex-1" : undefined}>{action.label}</span>
      {row && action.external ? (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-45" strokeWidth={2} aria-hidden />
      ) : null}
    </a>
  );
}
