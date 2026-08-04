"use client";

/**
 * SavedWallet — the user's saved places as an Apple Wallet-style fan of
 * field-guide specimen PLATES (owner concept 2026-07-02; specimen-stub
 * redesign approved 2026-07-08, scratchpad/saved-redesign.html).
 *
 * The deck: every card tucks to a 62px lip showing the serif name and ONE
 * mono fact chosen by value (walletFacts.lipFact). Tapping a lip raises the
 * card (accordion, one at a time); tapping the raised card opens its page.
 * A raised card keeps its brand-hued face (name, tier, the owner's field
 * note, a gold deal tag) and tears out a cream SPECIMEN-LABEL STUB below —
 * perforation and all — where the dense mono ledger (rating, price, today's
 * hours, town, kind, saved date) prints in ink on paper, plus the actions.
 * Field-guide plates carried their caption on the label, not on the plate.
 *
 * Cards wear the BUSINESS's own brand hue (place-hues.json, extracted from
 * its Google photo at build time) when we have one, else the category's
 * wallet ground — always as a DARKENED gradient so cream text clears AA.
 * Vermilion stays on its diet: only the live dot and the live card ring.
 *
 * Pure presentation over already-hydrated, already-sorted PlaceCardData.
 * Raise state can be CONTROLLED by the parent (openSlug/onOpenSlug) so the
 * On-now running line above the deck can raise a card; uncontrolled use
 * keeps the old internal accordion.
 */
import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CategoryIcon from "@/components/place/CategoryIcon";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import placeHues from "@/data/place-hues.json";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { PlaceCardData } from "@/lib/loaders/places";
import { googleMapsDirections } from "@/lib/integrations/deeplinks";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { BRAND } from "@/lib/brand";
import {
  distanceLabel,
  lipFact,
  priceGlyphs,
  savedDateLabel,
  todayHoursLine,
} from "@/components/saved/walletFacts";

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

/**
 * Per-BUSINESS brand hue, extracted from the place's own Google photo at
 * build time (scripts/build-place-hues.ts) — a real wallet's cards wear
 * their issuer's brand, not their spending category's. Every value is
 * pre-clamped to the wallet's jewel-tone register and pre-verified AA for
 * cream text on the darkened gradient ground. `_doc` rides along in the
 * JSON; the string index keeps it out of the way.
 */
const PLACE_HUES = placeHues as Record<string, string>;

/**
 * Wallet card GROUND, per place category — a deliberately more saturated,
 * jewel-toned set than the app's quiet category inks (categories.ts), used
 * when a place has no extracted brand hue. Families stay recognizable
 * (food warm, outdoors green, arts purple, civic blue) but each member
 * gets its own shade; every value clears WCAG AA for cream text on the
 * darkened gradient ground (verified: worst case 4.86:1).
 */
const WALLET_GROUND: Record<string, string> = {
  // Food & drink — warm reds, ambers, a wine, a rose
  restaurant: "#C23A22", pizza: "#D2481F", bakery: "#C77A1E", coffee: "#6F4A2F",
  bar: "#8A2433", brewery: BRAND.colors.functionalAmber, winery: "#7A2D5A", distillery: "#A6602E",
  "ice-cream": "#C85C86", market: "#3E8E41", agritourism: "#6B8E23",
  // Outdoors — greens + a playful teal for the kids' surface
  park: "#315A43", trail: "#1B4638", playground: "#2E8B8B", golf: "#2E7D5B",
  // Arts & culture — a purple family, split
  gallery: "#8E2C6F", music: "#A63F5C", museum: "#5B3A8F", theater: "#7A2E9F",
  library: "#285C8A", family: "#D98324",
  // Civic — a blue family, split; parking/services stay graphite
  civic: "#285D73", government: "#3E6488", transit: "#2A7A9A", parking: "#55534E",
  "public-safety": "#962633", worship: "#5B3A8F",
  // Shops, services, wellness, stay
  shopping: BRAND.colors.functionalAmber, antiques: "#8B5A2B", "book-store": "#6B4E8A",
  services: "#4A4A48", wellness: "#A83A4A", yoga: "#B85C6E",
  lodging: "#3E5A6E", pharmacy: "#2E7D6B",
};

function Card({
  place,
  index,
  open,
  savedAt,
  onOpen,
}: {
  place: PlaceCardData;
  index: number;
  open: boolean;
  savedAt?: string;
  onOpen: () => void;
}) {
  const router = useRouter();
  const cat = CATEGORY_BY_SLUG[place.category];
  // Brand-first: the business's own extracted hue, then the category's
  // wallet ground, then the category ink, then a civic blue.
  const hue =
    PLACE_HUES[place.slug] ?? WALLET_GROUND[place.category] ?? cat?.color ?? "#285D73";
  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name ?? null;
  const kind = cat?.name ?? "Place";
  const fact = lipFact(place, town);
  const live = Boolean(fact?.live);
  const rating =
    typeof place.google_rating === "number" && Number.isFinite(place.google_rating)
      ? place.google_rating.toFixed(1)
      : null;
  const ratingCount =
    typeof place.google_rating_count === "number" && place.google_rating_count > 0
      ? place.google_rating_count.toLocaleString("en-US")
      : null;
  const price = priceGlyphs(place.price_band);
  const sched = todayHoursLine(place.hours);
  const dist = distanceLabel(place.distance_m);
  const saved = savedDateLabel(savedAt);
  const dash = "Not available";

  function toggle() {
    if (open) {
      // Wallet behavior: a tap on the RAISED card opens it (like tapping a
      // pass). The visible "Open page" action stays as the discoverable route.
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
  // Links and real buttons inside the stub handle themselves; without this
  // a Directions tap would ALSO fire the card's open-page toggle.
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${place.name}${open ? ", raised. Tap again to open its page" : ", tap to raise"}`}
      onClick={toggle}
      onKeyDown={onKey}
      className={`sw-card${open ? " is-open" : ""}${live ? " sw-live-card" : ""}`}
      style={
        {
          // The card wears its brand hue as a darkened gradient so cream text
          // always clears AA — never the raw hue, never near-black (owner:
          // "can the cards not be so dark"). The dark stop mixes toward Ink,
          // the palette's own dark, at a 40% hue floor: the old literal
          // #0c0a06 was darker than Ink itself, off-palette, and exactly the
          // "so dark" the owner flagged. The calm comes from the deck
          // starting fully CLOSED (no card raised until tapped), not from
          // draining the color.
          background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, var(--app-ink)), color-mix(in srgb, ${hue} 40%, var(--app-ink)))`,
          // Stagger index for the deal-in entrance (see globals.css sw-deal).
          "--sw-i": index,
        } as CSSProperties
      }
    >
      {/* Full-card artwork — a DISTINCT motif per category family (swirl / facet
          / emboss / topo / strata / grid). The motif and the watermark glyph
          below are the card's ONE texture idea (brand guide: one visual idea
          at a time). The holographic sweep and metallic foil edge that used to
          stack on top were the interface advertising itself and are gone. */}
      <span className={`sw-art ${motifClass(place.category)}`} aria-hidden />
      {/* Big category glyph as the card's watermark "logo". */}
      <span className="sw-glyph" aria-hidden>
        <CategoryIcon slug={place.category} className="h-full w-full" strokeWidth={1.5} />
      </span>

      <div className="sw-face">
        {/* Lockup — the place's own photo medallion (category mark fallback)
            + serif name left. Right slot: the ONE
            mono lip fact while tucked; the category TIER wordmark on raise
            (the ledger below takes over the facts). */}
        <div className="sw-top">
          <span className="sw-brand">
            <PlaceMedallion
              place={place}
              size={32}
              shape="circle"
              surface="inverse"
            />
            <span className="sw-name">{place.name}</span>
          </span>
          {fact && (
            <span className={`sw-lipfact${fact.dim ? " is-dim" : ""}`}>
              {fact.live && <b className="sw-dot" aria-hidden />}
              {fact.text}
            </span>
          )}
          <span className="sw-tier">{kind.toUpperCase()}</span>
        </div>

        {/* Raised-only face content: the verified field note + deal tag —
            the rich, human fields stay on the brand plate. */}
        {(place.field_note_tip || place.deal_hook) && (
          <div className="sw-facebody">
            {place.field_note_tip && (
              <>
                <p className="sw-tip">{place.field_note_tip}</p>
                <p className="sw-tipsrc">Field note · verified at the source</p>
              </>
            )}
            {place.deal_hook && <span className="sw-dealtag">{place.deal_hook}</span>}
          </div>
        )}
      </div>

      {/* THE STUB — cream specimen label, perforated off the card foot.
          The dense mono ledger prints in ink on paper, where it's legible. */}
      <div className="sw-stub">
        <div className="sw-stub-grid">
          <dl className="sw-ledger">
            <div className="sw-cell">
              <dt>Rating</dt>
              <dd>
                {rating ? (
                  <>
                    <span className="sw-star" aria-hidden>★</span> {rating}
                    {ratingCount && <small> · {ratingCount}</small>}
                  </>
                ) : (
                  dash
                )}
              </dd>
            </div>
            <div className="sw-cell">
              <dt>Price</dt>
              <dd>
                {price ? (
                  <>
                    {price.shown}
                    {price.off && <span className="sw-dollar-off">{price.off}</span>}
                  </>
                ) : (
                  dash
                )}
              </dd>
            </div>
            {/* Full-width cell: a split schedule ("11 AM – 2 PM, 5 – 11 PM")
                never survives half a column. */}
            <div className="sw-cell sw-cell-wide">
              <dt>{sched?.label ?? "Hours"}</dt>
              <dd>{sched?.value ?? dash}</dd>
            </div>
            {dist && (
              <div className="sw-cell">
                <dt>From you</dt>
                <dd>{dist}</dd>
              </div>
            )}
            <div className="sw-cell">
              <dt>Town</dt>
              <dd>{town ?? dash}</dd>
            </div>
            <div className="sw-cell">
              <dt>Kind</dt>
              <dd>{kind}</dd>
            </div>
            {saved && (
              <div className="sw-cell">
                <dt>Saved</dt>
                <dd>{saved}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="sw-actions">
          <Link href={`/places/${place.slug}`} onClick={stop} tabIndex={open ? 0 : -1} className="sw-act-primary">
            Open page
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <a
            href={googleMapsDirections(place.geom.lat, place.geom.lng)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            tabIndex={open ? 0 : -1}
            className="sw-act-quiet"
          >
            Directions
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SavedWallet({
  places,
  savedAt,
  openSlug,
  onOpenSlug,
}: {
  places: PlaceCardData[];
  /** saved_at ISO per slug, for the stub ledger's Saved cell. */
  savedAt?: Record<string, string>;
  /** Controlled raise (SavedList's On-now line raises cards). When omitted,
   *  the wallet keeps its own internal accordion state. */
  openSlug?: string | null;
  onOpenSlug?: (slug: string) => void;
}) {
  // One card raised at a time (accordion), like Wallet. Keyed by slug so a
  // re-sort of `places` keeps the SAME card raised rather than whichever now
  // sits at the old index. Defaults to the top card.
  // Start fully closed — no card raised until the user taps one (or the
  // parent controls it via openSlug).
  const [internalSlug, setInternalSlug] = useState<string | null>(null);
  const controlled = openSlug !== undefined;
  const current = controlled ? openSlug : internalSlug;
  if (places.length === 0) return null;
  const openValid = places.some((p) => p.slug === current);
  return (
    <div className="sw-stack" role="list" aria-label="Saved places, as a card wallet">
      {places.map((p, i) => {
        // Start fully CLOSED — no card raised until the user taps one (owner:
        // "cards should start closed"). A card only opens via an explicit tap
        // or the parent's controlled openSlug (the On-now line).
        const open = openValid ? p.slug === current : false;
        return (
          // The SLOT carries the stack geometry (the -124px tuck and the
          // raise). It must live on this wrapper, not .sw-card: each card is
          // the :first-child of its own listitem, so a card-level
          // margin-top:0 first-child reset matched EVERY card and the wallet
          // rendered as full-height cards with no overlap (the shipped bug).
          // The id is the On-now line's scroll target.
          <div
            role="listitem"
            key={p.slug}
            id={`sw-slot-${p.slug}`}
            className={`sw-slot${open ? " is-open" : ""}`}
          >
            <Card
              place={p}
              index={i}
              open={open}
              savedAt={savedAt?.[p.slug]}
              onOpen={() => {
                onOpenSlug?.(p.slug);
                if (!controlled) setInternalSlug(p.slug);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
