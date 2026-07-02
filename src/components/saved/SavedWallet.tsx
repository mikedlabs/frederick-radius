"use client";

/**
 * SavedWallet — the user's saved places as an Apple Wallet-style fan of
 * pressed field-guide specimen cards (owner concept, 2026-07-02).
 *
 * The Saved page is already a personal collection of kept places, so it's the
 * one surface where the "cards you carry" metaphor earns its keep. Cards fan
 * in a vertical stack showing a header peek; tapping one raises it (accordion,
 * one open at a time) to reveal its mono data strip and an Open-page link.
 * Every card wears its category's color as a DARKENED ground so the cream text
 * always clears WCAG AA (the contrast pass, 2026-07-02) — never the raw hue.
 * Vermilion stays on its diet: the only vermilion here is the live "Open now"
 * dot, so the signal color still means one thing.
 *
 * Pure presentation over the already-hydrated + already-sorted PlaceCardData
 * the parent hands down — no data fetching, no store reads.
 */
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";

/** "21:00" -> "9 PM" for the open-until line; null on a bad value. */
function fmtClock(hhmm?: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const mer = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${mer}` : `${h12}:${String(m).padStart(2, "0")} ${mer}`;
}

/** The plate number climbs with stack position — Pl. I, II, III… — so the
 *  fan reads as a numbered field-guide collection, not a list. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function plate(i: number): string {
  return i < ROMAN.length ? ROMAN[i] : String(i + 1);
}

function openLabel(p: PlaceCardData): { text: string; live: boolean } | null {
  const s = p.open_status;
  if (!s) return null;
  // closesAt lives only on the open / closing-soon variants of the union.
  if (s.state === "open" || s.state === "closing-soon") {
    const till = fmtClock(s.closesAt);
    return { text: till ? `Open till ${till}` : "Open now", live: true };
  }
  if (s.state === "closed") return { text: "Closed now", live: false };
  return null;
}

function Card({
  place,
  index,
  open,
  onOpen,
}: {
  place: PlaceCardData;
  index: number;
  open: boolean;
  onOpen: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const hue = cat?.color ?? "#20506A";
  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name ?? null;
  const ol = openLabel(place);
  const dist =
    typeof place.distance_m === "number" && Number.isFinite(place.distance_m)
      ? place.distance_m < 1000
        ? `${Math.round(place.distance_m)} m`
        : `${(place.distance_m / 1609.34).toFixed(1)} mi`
      : null;

  function toggle() {
    if (open) return; // already raised — the Open-page link is the next action
    onOpen();
    haptic("light");
    track("saved_wallet_raise", { category: place.category });
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${place.name}${open ? "" : ", tap to open"}`}
      onClick={toggle}
      onKeyDown={onKey}
      className={`sw-card${open ? " is-open" : ""}`}
      style={{
        // Darkened category ground so cream text always clears AA — never the raw hue.
        background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, #16140E), color-mix(in srgb, ${hue} 34%, #0c0a06))`,
      }}
    >
      <div className="sw-row1">
        <span className="sw-brand">
          <CategoryIcon slug={place.category} className="h-[18px] w-[18px]" strokeWidth={2.25} />
          <span className="sw-name">{place.name}</span>
        </span>
        <span className="sw-plate">
          Pl. {plate(index)}
          <br />
          {cat?.name ?? "Place"}
        </span>
      </div>

      {place.short_blurb && <p className="sw-sub">{place.short_blurb}</p>}

      {/* Field-note stamp — the pressed mark for a place you've vouched for. */}
      {place.field_notes && (
        <span className="sw-stamp" aria-hidden>
          Field note<span>&#10003;</span>
        </span>
      )}

      {/* Big faint specimen glyph, watermark style. */}
      <span className="sw-glyph" aria-hidden>
        <CategoryIcon slug={place.category} className="h-full w-full" strokeWidth={1.5} />
      </span>

      <div className="sw-data">
        {ol && (
          <span className={`sw-chip${ol.live ? " sw-live" : ""}`}>
            {ol.live && <b aria-hidden />}
            {ol.text}
          </span>
        )}
        {dist && <span className="sw-chip">{dist}</span>}
        {town && <span className="sw-chip">{town}</span>}
      </div>

      <Link
        href={`/places/${place.slug}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={open ? 0 : -1}
        className="sw-open"
      >
        Open page &rarr;
      </Link>
    </div>
  );
}

export default function SavedWallet({ places }: { places: PlaceCardData[] }) {
  // One card raised at a time (accordion), like Wallet. Keyed by slug so a
  // re-sort of `places` keeps the SAME card raised rather than whichever now
  // sits at the old index. Defaults to the top card.
  const [openSlug, setOpenSlug] = useState<string | null>(places[0]?.slug ?? null);
  if (places.length === 0) return null;
  const openValid = places.some((p) => p.slug === openSlug);
  return (
    <div className="sw-stack" role="list" aria-label="Saved places, as a card wallet">
      {places.map((p, i) => (
        <div role="listitem" key={p.slug}>
          <Card
            place={p}
            index={i}
            open={openValid ? p.slug === openSlug : i === 0}
            onOpen={() => setOpenSlug(p.slug)}
          />
        </div>
      ))}
    </div>
  );
}
