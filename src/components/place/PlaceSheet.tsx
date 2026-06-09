"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ExternalLink, Phone, Globe, Navigation, X, Expand, ChevronRight, MapPin, Instagram, Footprints, Car, UtensilsCrossed, ShoppingBag, ParkingCircle, BookOpen } from "lucide-react";
import { placeActions, type PlaceAction } from "@/lib/place-actions";
import Link from "next/link";
import Image from "next/image";
import { haptic } from "@/lib/haptics";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import OpenClosedDot from "./OpenClosedDot";
import GoogleHours from "./GoogleHours";
import SaveButton from "@/components/saved/SaveButton";
import ShareButton from "./ShareButton";
import SourceBadge from "./SourceBadge";
import type { PlaceCardData } from "@/lib/loaders/places";
import TrustChip from "@/components/ui/TrustChip";
import FreshnessChip from "@/components/ui/FreshnessChip";
import { placeHoursTrust, formatChecked } from "@/lib/trust";
import { knownFor } from "@/lib/cuisine";
import { classifyDescription } from "@/lib/copy-quality";
import { formatDistance } from "@/lib/geo";
import type { ParcelContext } from "@/lib/loaders/cofParcels";
import PhotoLightbox from "@/components/ui/PhotoLightbox";

/**
 * Bottom-sheet detail view for a place. Slides up with spring physics,
 * dragable via the handle at top, swipe-down to dismiss past 100px.
 *
 * Trigger: PlaceCardLink or any consumer calls openPlaceSheet(place)
 * via the context provided by PlaceSheetProvider.
 */
type Props = {
  place: PlaceCardData | null;
  onClose: () => void;
};

export default function PlaceSheet({ place, onClose }: Props) {
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 300], [0.45, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (place) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs sheet-open state to the incoming place prop to drive the open animation
      setOpen(true);
      haptic("light");
    }
  }, [place]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC dismisses — a baseline keyboard-accessibility expectation
  // for any modal/dialog. Audit feedback: the sheet felt locked;
  // hardware-key escape is one more way out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      haptic("light");
      setOpen(false);
      setTimeout(onClose, 220);
    } else {
      y.set(0);
    }
  };

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && place && (
        <div className="fixed inset-0 z-[var(--z-overlay)]" aria-modal="true" role="dialog" aria-label={place.name}>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close"
            onClick={() => { haptic("light"); setOpen(false); }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black"
            style={{ opacity: backdropOpacity }}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 600 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            style={{ y }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-[24px] border-t bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
          >
            <PlaceSheetContent place={place} onClose={() => setOpen(false)} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function PlaceSheetContent({ place, onClose }: { place: PlaceCardData; onClose: () => void }) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const muni = MUNICIPALITY_BY_SLUG[place.municipality];
  const color = cat?.color ?? "var(--app-brand)";

  // Real walk/drive time from downtown via Routes API (on-demand, cached server-side)
  const [travel, setTravel] = useState<{ walkMin?: number; driveMin?: number } | null>(null);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const [venueEvents, setVenueEvents] = useState<
    { slug: string; title: string; weekday: string; day: string; month: string; time: string }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/travel-time?lat=${place.geom.lat}&lng=${place.geom.lng}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && (d.walkMin != null || d.driveMin != null)) setTravel(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [place.geom.lat, place.geom.lng]);

  // On-demand Google enrichment for the long-tail (DFP) places that have no
  // build-time enrichment. Curated places already carry google_photo_url.
  const [extra, setExtra] = useState<{
    photos: string[]; hours: string[]; phone?: string; website?: string;
  } | null>(null);
  useEffect(() => {
    if (place.google_photo_url) return; // already statically enriched
    let cancelled = false;
    fetch(`/api/place/${place.slug}/enrich`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setExtra(d); })
      .catch(() => {});
    return () => { cancelled = true; setExtra(null); };
  }, [place.slug, place.google_photo_url]);

  // Upcoming events happening AT this venue — a strong "should I go" signal.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place/${place.slug}/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.events)) setVenueEvents(d.events); })
      .catch(() => {});
    return () => { cancelled = true; setVenueEvents([]); };
  }, [place.slug]);

  // City of Frederick parcel context, on-demand. Dormant by default:
  // the route returns null until the City source is approved, activated,
  // and COF_PARCELS=1, so nothing renders in production until then.
  const [parcel, setParcel] = useState<ParcelContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place/${place.slug}/parcel`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.parcel_id) setParcel(d as ParcelContext); })
      .catch(() => {});
    return () => { cancelled = true; setParcel(null); };
  }, [place.slug]);

  // Static enrichment wins; on-demand fills the gap.
  const photos = place.google_photos?.length
    ? place.google_photos
    : (extra?.photos ?? []);
  const heroUrl = place.google_photo_url ?? photos[0];
  // Every unique photo (hero first), for the tap-to-enlarge lightbox.
  const allPhotos = Array.from(new Set([heroUrl, ...photos].filter(Boolean))) as string[];
  const hoursLines = place.google_hours?.length
    ? place.google_hours
    : (extra?.hours ?? []);
  const effectivePlace = {
    ...place,
    phone: place.phone ?? extra?.phone,
    website: place.website ?? extra?.website,
  };

  return (
    <>
      {/* Drag handle + explicit close.
       *  Audit feedback: the sheet felt "locked" because the small X
       *  in the header row was easy to miss. A labeled "Close" button
       *  here at the top with an explicit X icon makes it obvious that
       *  this thing dismisses. Tap target matches iOS sheet minimum
       *  (44pt). Drag handle stays for swipe-down dismiss. */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <button
          type="button"
          onClick={() => { haptic("light"); onClose(); }}
          aria-label="Close and return to the map"
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition active:scale-[0.96]"
          style={{ color: "var(--app-ink-2)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Close
        </button>
        <span
          aria-hidden
          className="block h-1 w-10 rounded-full"
          style={{ background: "var(--app-border)" }}
        />
        <span className="w-[64px]" aria-hidden />
      </div>

      {/* Scrollable content. The outer motion.div is flex-col with
       *  max-h-[85vh] + overflow-hidden, so this inner panel is
       *  flex-1 + min-h-0 — that's the standard flex idiom for
       *  letting a child be the actual scroll region. Before this,
       *  the inner had `overflow-y-auto` but no height constraint,
       *  so content past the cap just got clipped — users couldn't
       *  reach the bottom details. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom,0px)+24px,24px)]">
        {/* Cinematic hero — full-bleed, 4:3 aspect, with a bottom
         *  gradient that fades the photo into the sheet. The category
         *  eyebrow + place name overlay the gradient so the first
         *  thing the eye reads is "Brewery · Olde Mother Brewing"
         *  on the actual place's photo, not a generic header below it.
         *  When there is no photo, we fall back to a category-tinted
         *  panel with the icon — still cinematic, still on-brand. */}
        {heroUrl ? (
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
              priority
              sizes="(max-width: 720px) 100vw, 720px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <span
              aria-hidden
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full"
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
            {/* Save button anchored to the upper-right of the photo —
             *  keeps the cinematic crop clean while staying tappable. */}
            <div className="absolute right-3 top-3">
              <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
            </div>
          </div>
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
        <div className="px-5 pt-4">
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
            <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              {place.address}{muni ? ` · ${muni.name}` : ""}
            </p>
            <SourceBadge place={place} size="sm" />
          </div>
          {knownFor(place) && (
            <p
              className="mt-1.5 text-[13px] italic leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              Known for {knownFor(place)}.
            </p>
          )}

          {/* Status + rating + price + distance — the at-a-glance
           *  data row. Kept compact so the next block (the trust pill
           *  cluster) reads as a single thought. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--app-ink-2)" }}>
            <OpenClosedDot status={place.open_status} />
            {place.google_rating !== undefined && (
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--app-ink-2)" }}>
                <span style={{ color: "var(--app-accent)" }}>★</span>
                {place.google_rating.toFixed(1)}
                {place.google_rating_count ? (
                  <span style={{ color: "var(--app-ink-3)" }}>({place.google_rating_count.toLocaleString()})</span>
                ) : null}
              </span>
            )}
            {place.price_band && (
              <span className="font-medium" style={{ color: "var(--app-ink-3)" }}>
                {"$".repeat(place.price_band)}
              </span>
            )}
            {place.distance_m !== undefined && (
              <span className="tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {formatDistance(place.distance_m)} away
              </span>
            )}
          </div>

          {/* Compact trust cluster — TrustChip + verified-by-Google
           *  dot + FreshnessChip, on ONE row separated by middle dots.
           *  The previous layout stacked three tiny rows on top of
           *  each other; this reads as one trust statement. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TrustChip signal={placeHoursTrust(place.open_status)} />
            {place.google_verified && (
              <>
                <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--app-positive)" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} aria-hidden />
                  Confirmed by Google
                </span>
              </>
            )}
            <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
            <FreshnessChip iso={place.last_verified_at} />
          </div>

        {parcel && (
          <div
            className="mt-3 rounded-[var(--app-radius-md)] border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                City of Frederick record
              </p>
              <TrustChip
                signal={{
                  level: "official",
                  label: "City record",
                  basis: "Matched to the City of Frederick parcel",
                }}
              />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {parcel.zoning && (
                <>
                  <dt style={{ color: "var(--app-ink-3)" }}>Zoning</dt>
                  <dd>{parcel.zoning}{parcel.zoning_overlays.length > 0 ? ` (+ ${parcel.zoning_overlays.join(", ")})` : ""}</dd>
                </>
              )}
              {parcel.land_use && (
                <>
                  <dt style={{ color: "var(--app-ink-3)" }}>Land use</dt>
                  <dd>{parcel.land_use}</dd>
                </>
              )}
              {parcel.subdivision && (
                <>
                  <dt style={{ color: "var(--app-ink-3)" }}>Subdivision</dt>
                  <dd>{parcel.subdivision}</dd>
                </>
              )}
              {parcel.neighborhood_advisory_council && (
                <>
                  <dt style={{ color: "var(--app-ink-3)" }}>Neighborhood council</dt>
                  <dd>{parcel.neighborhood_advisory_council}</dd>
                </>
              )}
              {parcel.election_district != null && (
                <>
                  <dt style={{ color: "var(--app-ink-3)" }}>Election district</dt>
                  <dd>{parcel.election_district}</dd>
                </>
              )}
              {(parcel.schools.elementary || parcel.schools.middle || parcel.schools.high) && (
                <>
                  <dt style={{ color: "var(--app-ink-3)" }}>Schools</dt>
                  <dd>{[parcel.schools.elementary, parcel.schools.middle, parcel.schools.high].filter(Boolean).join(" / ")}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {/* Real travel time from downtown (Routes API) */}
        {travel && (travel.walkMin != null || travel.driveMin != null) && (
          <div
            className="mt-3 inline-flex items-center gap-3 rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            {travel.walkMin != null && (
              <span className="inline-flex items-center gap-1">
                <Footprints className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
                {travel.walkMin} min walk
              </span>
            )}
            {travel.driveMin != null && (
              <span className="inline-flex items-center gap-1">
                <Car className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
                {travel.driveMin} min drive
              </span>
            )}
            <span style={{ color: "var(--app-ink-3)" }}>from downtown</span>
          </div>
        )}

        {/* Blurb — gated by the copy-quality detector so scraped junk
            (phone numbers, contact CTAs, addresses) never shows. */}
        {place.short_blurb && classifyDescription(place.name, place.short_blurb) !== "scraped" && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {place.short_blurb}
          </p>
        )}

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
                  alt={`${place.name} photo ${i + 2}`}
                  fill
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

        {/* In-app actions — reserve / order / park / directions without leaving */}
        <div className="mt-5 flex flex-wrap gap-2">
          {placeActions(effectivePlace).map((a) => (
            <ActionChip key={a.key} action={a} />
          ))}
        </div>

        {/* Footer — link to full page + share */}
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs" style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={`/places/${place.slug}`}
            onClick={() => haptic("light")}
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: "var(--app-brand)" }}
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
  website: Globe,
  reserve: UtensilsCrossed,
  order: ShoppingBag,
  parking: ParkingCircle,
  instagram: Instagram,
  menu: BookOpen,
} as const;

function ActionChip({ action }: { action: PlaceAction }) {
  const Icon = ACTION_ICON[action.icon];
  return (
    <a
      href={action.href}
      onClick={() => haptic("light")}
      target="_blank"
      rel="noopener noreferrer"
      className="tactile-lift tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white"
      style={{ backgroundColor: action.accent }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      {action.label}
    </a>
  );
}
