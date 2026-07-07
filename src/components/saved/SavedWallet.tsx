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
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/**
 * The card's background MOTIF, by category family — the thing that makes the
 * stack read as a wallet of distinct cards (Citi swirl / UOB facets / DBS
 * emboss) rather than one hue-swapped template. Falls back to the guilloché
 * swirl for the long tail. See the .sw-m-* rules in globals.css.
 */
const MOTIF_BY_FAMILY: Record<string, string> = {
  food: "swirl", restaurant: "swirl", bakery: "swirl", pizza: "swirl", dessert: "swirl", grocery: "swirl", market: "swirl",
  brewery: "facet", bar: "facet", winery: "facet", distillery: "facet", coffee: "facet", cafe: "facet", cidery: "facet",
  arts: "emboss", music: "emboss", theater: "emboss", gallery: "emboss", museum: "emboss", family: "emboss", publicart: "emboss", library: "emboss", culture: "emboss",
  park: "topo", trail: "topo", outdoors: "topo", nature: "topo", garden: "topo", water: "topo", recreation: "topo", hike: "topo",
  shopping: "strata", shop: "strata", retail: "strata", services: "strata", wellness: "strata", spa: "strata", lodging: "strata", hotel: "strata", stay: "strata",
  civic: "grid", transit: "grid", parking: "grid", government: "grid",
};
function motifClass(category: string): string {
  return `sw-m-${MOTIF_BY_FAMILY[category] ?? "swirl"}`;
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
  const router = useRouter();
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
    if (open) {
      // Wallet behavior: a tap on the RAISED card opens it (like tapping a
      // pass). The visible "Open page" link stays as the discoverable route.
      haptic("light");
      track("saved_wallet_open_page", { category: place.category });
      router.push(`/places/${place.slug}`);
      return;
    }
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
      aria-label={`${place.name}${open ? ", tap again to open its page" : ", tap to raise"}`}
      onClick={toggle}
      onKeyDown={onKey}
      className={`sw-card${open ? " is-open" : ""}${ol?.live ? " sw-live-card" : ""}`}
      style={
        {
          // Darkened category ground so cream text always clears AA — never the raw hue.
          background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, #16140E), color-mix(in srgb, ${hue} 34%, #0c0a06))`,
          // Stagger index for the deal-in entrance (see globals.css sw-deal).
          "--sw-i": index,
        } as CSSProperties
      }
    >
      {/* Full-card artwork — a DISTINCT motif per category family (swirl / facet
          / emboss / topo / strata / grid), the field-guide answer to the Citi
          swirl / UOB facets / DBS emboss that make each Wallet card its own. */}
      <span className={`sw-art ${motifClass(place.category)}`} aria-hidden />
      {/* Holographic foil — an iridescent band that sweeps across a raised card,
          the premium "holo" pop, tinted via soft-light so it never fights the
          brand palette. Reduced-motion users get a still, subtle sheen. */}
      <span className="sw-holo" aria-hidden />
      {/* Big category glyph as the card's watermark "logo". */}
      <span className="sw-glyph" aria-hidden>
        <CategoryIcon slug={place.category} className="h-full w-full" strokeWidth={1.5} />
      </span>

      {/* Lockup — bold glyph "logo" + name left; category TIER wordmark right,
          the logo-left / product-right structure of a real card. */}
      <div className="sw-top">
        <span className="sw-brand">
          <CategoryIcon slug={place.category} className="h-[22px] w-[22px]" strokeWidth={2.25} />
          <span className="sw-name">{place.name}</span>
        </span>
        <span className="sw-tier">{(cat?.name ?? "Place").toUpperCase()}</span>
      </div>

      {/* Field-note stamp — the pressed mark for a place you've vouched for. */}
      {place.field_notes && (
        <span className="sw-stamp" aria-hidden>
          Field note<span>&#10003;</span>
        </span>
      )}

      {/* Foot — the card's "number" line: plate + category + live data, with a
          contactless glyph at the trailing edge. Revealed on raise. */}
      <div className="sw-foot">
        <div className="sw-data">
          <span className="sw-chip sw-plate">Pl. {plate(index)}</span>
          {ol && (
            <span className={`sw-chip${ol.live ? " sw-live" : ""}`}>
              {ol.live && <b aria-hidden />}
              {ol.text}
            </span>
          )}
          {dist && <span className="sw-chip">{dist}</span>}
          {town && <span className="sw-chip">{town}</span>}
        </div>
        <span className="sw-tap" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 7a7 7 0 0 1 0 10" />
            <path d="M12 4a11 11 0 0 1 0 16" />
            <path d="M4 10a3.5 3.5 0 0 1 0 4" />
          </svg>
        </span>
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
      {places.map((p, i) => {
        const open = openValid ? p.slug === openSlug : i === 0;
        return (
          // The SLOT carries the stack geometry (the -144px tuck and the
          // raise). It must live on this wrapper, not .sw-card: each card is
          // the :first-child of its own listitem, so a card-level
          // margin-top:0 first-child reset matched EVERY card and the wallet
          // rendered as full-height cards with no overlap (the shipped bug).
          <div role="listitem" key={p.slug} className={`sw-slot${open ? " is-open" : ""}`}>
            <Card
              place={p}
              index={i}
              open={open}
              onOpen={() => setOpenSlug(p.slug)}
            />
          </div>
        );
      })}
    </div>
  );
}
