"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ExternalLink, Phone, Globe, Navigation, X, MapPin, Instagram, Footprints, Car } from "lucide-react";
import Link from "next/link";
import { haptic } from "@/lib/haptics";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import OpenClosedDot from "./OpenClosedDot";
import SaveButton from "@/components/saved/SaveButton";
import ShareButton from "./ShareButton";
import type { PlaceCardData } from "@/lib/loaders/places";

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
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${place.geom.lat},${place.geom.lng}`;

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

        {/* Action grid */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionPill href={mapsUrl} icon={Navigation} label="Directions" external />
          {place.phone && <ActionPill href={`tel:${place.phone.replace(/[^0-9+]/g, "")}`} icon={Phone} label="Call" />}
          {place.website && <ActionPill href={place.website} icon={Globe} label="Website" external />}
          {place.instagram && <ActionPill href={`https://instagram.com/${place.instagram}`} icon={Instagram} label="Instagram" external />}
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

function ActionPill({
  href, icon: Icon, label, external,
}: { href: string; icon: typeof Phone; label: string; external?: boolean }) {
  const Comp = external ? "a" : Link;
  return (
    <Comp
      href={href}
      onClick={() => haptic("light")}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center justify-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] py-2.5 text-xs font-semibold transition active:scale-[0.97]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </Comp>
  );
}
