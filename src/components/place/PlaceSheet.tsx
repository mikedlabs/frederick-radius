"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ExternalLink, Phone, Globe, Navigation, X, MapPin, Instagram, Footprints, Car, UtensilsCrossed, ShoppingBag, ParkingCircle, BookOpen } from "lucide-react";
import { placeActions, type PlaceAction } from "@/lib/place-actions";
import Link from "next/link";
import { haptic } from "@/lib/haptics";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import OpenClosedDot from "./OpenClosedDot";
import GoogleHours from "./GoogleHours";
import SaveButton from "@/components/saved/SaveButton";
import ShareButton from "./ShareButton";
import type { PlaceCardData } from "@/lib/loaders/places";
import TrustChip from "@/components/ui/TrustChip";
import { placeHoursTrust } from "@/lib/trust";

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
        <div className="fixed inset-0 z-50" aria-modal="true" role="dialog" aria-label={place.name}>
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
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-[24px] border-t bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
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

  // Static enrichment wins; on-demand fills the gap.
  const photos = place.google_photos?.length
    ? place.google_photos
    : (extra?.photos ?? []);
  const heroUrl = place.google_photo_url ?? photos[0];
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
      {/* Drag handle */}
      <div className="flex justify-center pt-2 pb-1" aria-hidden>
        <span
          className="block h-1 w-9 rounded-full"
          style={{ background: "var(--app-border)" }}
        />
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom,0px)+24px,24px)] pt-2">
        {/* Hero photo — the real place, not a category gradient */}
        {heroUrl && (
          <div
            className="-mt-1 mb-3 overflow-hidden rounded-[var(--app-radius-lg)] border"
            style={{ borderColor: "var(--app-border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroUrl}
              alt={place.name}
              className="aspect-[16/9] w-full object-cover"
              loading="eager"
            />
          </div>
        )}

        {/* Top — category pill, name, blurb */}
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${color}1A`, color }}
          >
            <MapPin className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
              {cat?.name ?? place.category}
            </p>
            <h2 className="font-serif text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              {place.name}
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {place.address} · {muni?.name ?? place.municipality}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} />
            <button
              type="button"
              aria-label="Close"
              onClick={() => { haptic("light"); onClose(); }}
              className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-[var(--app-bg-sunken)]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* Status + distance row */}
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
              {place.distance_m < 1000 ? `${Math.round(place.distance_m)} ft` : `${(place.distance_m / 1000).toFixed(1)} km away`}
            </span>
          )}
        </div>
        <div className="mt-2">
          <TrustChip signal={placeHoursTrust(place.open_status)} />
        </div>
        {place.google_verified && (
          <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--app-positive)" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} aria-hidden />
            Verified by Google
          </p>
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

        {/* Blurb */}
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {place.short_blurb}
        </p>

        {/* Photo strip — more of what the place actually looks like */}
        {photos.length > 1 && (
          <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {photos.slice(1, 8).map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={`${place.name} photo ${i + 2}`}
                loading="lazy"
                className="h-24 w-32 shrink-0 rounded-[var(--app-radius-md)] border object-cover"
                style={{ borderColor: "var(--app-border)" }}
              />
            ))}
          </div>
        )}

        {/* Hours from Google */}
        {hoursLines.length > 0 && (
          <div className="mt-4">
            <GoogleHours lines={hoursLines} />
          </div>
        )}

        {/* In-app actions — reserve / order / park / directions without leaving */}
        <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
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
          />
        </div>
      </div>
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
      style={{
        borderColor: action.accent,
        color: "white",
        background: action.accent,
      }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      {action.label}
    </a>
  );
}
