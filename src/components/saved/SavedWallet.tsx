"use client";

/**
 * SavedWallet — the user's saved places as an Apple Wallet-style fan of
 * field-guide specimen PLATES (owner concept 2026-07-02; specimen-stub
 * redesign approved 2026-07-08, scratchpad/saved-redesign.html).
 *
 * The deck: every card tucks to a 62px lip showing the serif name and ONE
 * mono fact chosen by value (walletFacts.lipFact). Tapping a lip raises the
 * card (accordion, one at a time); the place name and the explicit action
 * open its page.
 * Neutral card faces and hairlines keep place details readable in both
 * themes. Only real live conditions receive a status accent.
 *
 * Pure presentation over already-hydrated, already-sorted PlaceCardData.
 * Raise state can be CONTROLLED by the parent (openSlug/onOpenSlug) so the
 * On-now running line above the deck can raise a card; uncontrolled use
 * keeps the old internal accordion.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import CategoryIcon from "@/components/place/CategoryIcon";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { PlaceCardData } from "@/lib/loaders/places";
import { googleMapsDirections } from "@/lib/integrations/deeplinks";
import { useFollowMutationState, useToggleFollow } from "@/hooks/useFollows";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { withBrowseReturnTo } from "@/lib/browse-return";
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


function Card({
  place,
  open,
  savedAt,
  onToggle,
}: {
  place: PlaceCardData;
  open: boolean;
  savedAt?: string;
  onToggle: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  // Un-save, from the card itself. This deck is where a person curates their
  // collection, and until now removing a card meant leaving for the place
  // page to find its save control. The toggle is the same auth-aware seam
  // the save side uses (DB when signed in, localStorage otherwise), so the
  // stores update and the card leaves the deck without a reload. One tap, no
  // confirm: re-saving is a single tap on the place page, so the mistake
  // costs less than a dialog on every intended removal.
  const failureDescriptionRef = useRef<string | null>(null);
  const toggleFollow = useToggleFollow(place.slug, "saved_wallet", (description) => { failureDescriptionRef.current = description; });
  const mutation = useFollowMutationState(place.slug);
  const removingRef = useRef(false);
  const [removing, setRemoving] = useState(false);
  const busy = removing || mutation === "saving" || mutation === "removing";
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
    onToggle();
    haptic("light");
    track(open ? "saved_wallet_collapse" : "saved_wallet_raise", {
      category: place.category,
    });
  }

  return (
    <div
      className={`sw-card${open ? " is-open" : ""}${live ? " sw-live-card" : ""}`}
      style={{ background: "var(--app-bg-elevated-solid)" }}
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
          <Link
            href={withBrowseReturnTo(`/places/${place.slug}`, "/my-radius")}
            className="sw-brand"
            onClick={() =>
              track("saved_wallet_open_page", { category: place.category })
            }
          >
            <PlaceMedallion
              place={place}
              size={32}
              shape="circle"
              surface="paper"
            />
            <span className="sw-name">{place.name}</span>
          </Link>
          <span className="sw-card-summary">
            {fact && (
              <span className={`sw-lipfact${fact.dim ? " is-dim" : ""}`}>
                {fact.live && <b className="sw-dot" aria-hidden />}
                {fact.text}
              </span>
            )}
            <span className="sw-tier">{kind.toUpperCase()}</span>
            <button
              type="button"
              className="sw-disclosure tap-44"
              aria-expanded={open}
              aria-controls={`sw-stub-${place.slug}`}
              aria-label={`${open ? "Hide" : "Show"} details for ${place.name}`}
              onClick={toggle}
            >
              <ChevronDown aria-hidden className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </span>
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
      <div className="sw-stub" id={`sw-stub-${place.slug}`}>
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
          <Link href={withBrowseReturnTo(`/places/${place.slug}`, "/my-radius")} className="sw-act-primary">
            Open page
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <a
            href={googleMapsDirections(place.geom.lat, place.geom.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="sw-act-quiet"
          >
            Directions
          </a>
          <button
            type="button"
            onClick={async () => {
              if (removingRef.current) return;
              removingRef.current = true;
              setRemoving(true);
              failureDescriptionRef.current = null;
              try {
                const stillSaved = await toggleFollow(false);
                if (failureDescriptionRef.current !== null || stillSaved) throw new Error("Removal not confirmed");
                haptic("light");
              } catch {
                toast.error("Could not remove from Saved", { description: failureDescriptionRef.current ?? "We could not confirm this change. Please try again." });
              } finally {
                setRemoving(false);
                removingRef.current = false;
              }
            }}
            disabled={busy}
            aria-busy={busy}
            className="sw-act-quiet"
            style={{ marginLeft: "auto" }}
            aria-label={`Remove ${place.name} from saved`}
          >
            {busy ? mutation === "saving" && !removing ? "Saving…" : "Removing…" : "Remove"}
          </button>
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
  onOpenSlug?: (slug: string | null) => void;
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
      {places.map((p) => {
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
              open={open}
              savedAt={savedAt?.[p.slug]}
              onToggle={() => {
                const next = open ? null : p.slug;
                onOpenSlug?.(next);
                if (!controlled) setInternalSlug(next);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
