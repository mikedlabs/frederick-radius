"use client";

/**
 * SavedEventWallet — the user's saved EVENTS as a fan of laminated cards,
 * the sibling deck of SavedWallet (places). One collection: it reuses the
 * exact .sw-* lamination / foil edge / lip / stub / tap affordance so a
 * deck of place cards above and a deck of event cards below read as the
 * same wallet, just for events (owner ask 2026-07-08).
 *
 * Each card wears its event CATEGORY's hue as a DARKENED gradient ground
 * (so cream text clears AA), mirroring how a place card wears its business
 * brand hue. Vermilion stays on its diet: only the live dot + live ring,
 * when isEventLiveNow says the show is on this minute.
 *
 * The deck: every card tucks to a 62px lip (serif title + ONE mono fact by
 * value — "On now" beats the compact when). Tapping a lip raises the card
 * (accordion, one at a time); tapping the raised card opens /events/[slug].
 * The raised card tears out the same cream SPECIMEN-LABEL STUB places use,
 * where the mono ledger prints the full when, venue, town, kind, admission,
 * and saved date, plus the actions (Open event · Directions · Tickets).
 *
 * Pure presentation over already-assembled, already-sorted Events. Reuses
 * the shared event helpers (eventLipFact / eventWhenParts / eventPriceLabel,
 * built on eventDateBlock + isEventLiveNow) so no claim outruns the data.
 */
import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { Event } from "@/data/events";
import { googleMapsDirections } from "@/lib/integrations/deeplinks";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { plate, savedDateLabel } from "@/components/saved/walletFacts";
import { eventLipFact, eventPriceLabel, eventWhenParts } from "@/components/saved/eventWalletFacts";

/**
 * The background MOTIF per event-category family — reuses the place wallet's
 * security-print set (.sw-m-*) so the two decks share one texture language.
 * Events skew arts/family, so the damask emboss carries most of them.
 */
const EVENT_MOTIF: Record<string, string> = {
  arts: "emboss", music: "emboss", theater: "emboss", gallery: "emboss",
  museum: "emboss", "public-art": "emboss", film: "emboss", comedy: "emboss",
  family: "emboss", library: "emboss",
  market: "swirl", food: "swirl", "food-truck": "swirl", restaurant: "swirl", festival: "swirl",
  outdoors: "topo", park: "topo", trail: "topo", sports: "topo", agritourism: "topo",
  civic: "grid", community: "grid", government: "grid", education: "grid",
};
function eventMotifClass(category: string): string {
  return `sw-m-${EVENT_MOTIF[category] ?? "swirl"}`;
}

/**
 * Wallet card GROUND per event category — a jewel-toned set deliberately
 * OFF vermilion (CLAUDE.md: vermilion rides only the live dot / live ring),
 * mirroring the place wallet's WALLET_GROUND intent for the categories
 * events actually use. The darkened gradient below clears WCAG AA for cream
 * text over any of these; the map just keeps families recognizable (arts
 * purple, family amber, market/outdoors green, civic blue).
 */
const EVENT_GROUND: Record<string, string> = {
  music: "#A63F5C", arts: "#7A2E9F", theater: "#7A2E9F", gallery: "#8E2C6F",
  museum: "#5B3A8F", "public-art": "#9B3F8A", film: "#5B3A8F", comedy: "#A63F5C",
  family: "#C0871F", library: "#285C8A",
  market: "#3E8E41", "food-truck": "#C0871F", food: "#C0871F", restaurant: "#C23A22",
  outdoors: "#1E6B3A", park: "#1E6B3A", sports: "#1E6B3A", agritourism: "#6B8E23",
  festival: "#B85C1E",
  civic: "#20506A", community: "#3E6488", government: "#20506A", education: "#285C8A",
};

function Card({
  event,
  index,
  open,
  savedAt,
  now,
  onOpen,
}: {
  event: Event;
  index: number;
  open: boolean;
  savedAt?: string;
  now: Date;
  onOpen: () => void;
}) {
  const router = useRouter();
  const cat = CATEGORY_BY_SLUG[event.category];
  // Category-first hue: the jewel ground for the category, then the category
  // ink, then a default arts purple (events skew arts). Never raw vermilion.
  const hue = EVENT_GROUND[event.category] ?? cat?.color ?? "#7A2E9F";
  const town = MUNICIPALITY_BY_SLUG[event.municipality]?.name ?? null;
  const kind = cat?.name ?? "Event";
  const fact = eventLipFact(event, now);
  const when = eventWhenParts(event);
  const price = eventPriceLabel(event);
  const saved = savedDateLabel(savedAt);
  const hasGeom =
    Boolean(event.geom) && Number.isFinite(event.geom.lat) && Number.isFinite(event.geom.lng);
  // eslint-disable-next-line no-restricted-syntax -- standalone no-data glyph in the mono ledger, not prose
  const dash = "—";

  function toggle() {
    if (open) {
      // Wallet behavior: a tap on the RAISED card opens it (like a pass).
      // The visible "Open event" action stays the discoverable route.
      haptic("light");
      track("saved_event_wallet_open", { category: event.category });
      router.push(`/events/${event.slug}`);
      return;
    }
    onOpen();
    haptic("light");
    track("saved_event_wallet_raise", { category: event.category });
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }
  // Links inside the stub handle themselves; without this a Tickets tap
  // would ALSO fire the card's open toggle.
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${event.title}${open ? ", raised. Tap again to open its page" : ", tap to raise"}`}
      onClick={toggle}
      onKeyDown={onKey}
      className={`sw-card${open ? " is-open" : ""}${fact.live ? " sw-live-card" : ""}`}
      style={
        {
          // Darkened category ground so cream text always clears AA — never the raw hue.
          background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, #16140E), color-mix(in srgb, ${hue} 34%, #0c0a06))`,
          "--sw-i": index,
        } as CSSProperties
      }
    >
      {/* Same full-card motif / holo / foil-edge / watermark treatment the
          place cards wear, so the two decks read as one wallet. */}
      <span className={`sw-art ${eventMotifClass(event.category)}`} aria-hidden />
      <span className="sw-holo" aria-hidden />
      <span className="sw-foil-edge" aria-hidden />
      <span className="sw-glyph" aria-hidden>
        <CategoryIcon slug={event.category} className="h-full w-full" strokeWidth={1.5} />
      </span>

      <div className="sw-face">
        {/* Lockup — category glyph "logo" + serif title left. Right slot: the
            ONE mono lip fact while tucked; the category TIER wordmark on raise. */}
        <div className="sw-top">
          <span className="sw-brand">
            <CategoryIcon slug={event.category} className="h-[21px] w-[21px]" strokeWidth={2.25} />
            <span className="sw-name">{event.title}</span>
          </span>
          <span className={`sw-lipfact${fact.dim ? " is-dim" : ""}`}>
            {fact.live && <b className="sw-dot" aria-hidden />}
            {fact.text}
          </span>
          <span className="sw-tier">{kind.toUpperCase()}</span>
        </div>
      </div>

      {/* THE STUB — the same cream specimen label the place cards tear out,
          with the event's mono ledger printed in ink on paper. */}
      <div className="sw-stub">
        <div className="sw-stub-grid">
          <dl className="sw-ledger">
            <div className="sw-cell sw-cell-wide">
              <dt>When</dt>
              <dd>
                {when.date}
                {when.time ? ` · ${when.time}` : ""}
              </dd>
            </div>
            <div className="sw-cell sw-cell-wide">
              <dt>Where</dt>
              <dd>{event.venue_name || dash}</dd>
            </div>
            <div className="sw-cell">
              <dt>Town</dt>
              <dd>{town ?? dash}</dd>
            </div>
            <div className="sw-cell">
              <dt>Kind</dt>
              <dd>{kind}</dd>
            </div>
            <div className="sw-cell sw-cell-wide">
              <dt>Admission</dt>
              <dd>{price ?? dash}</dd>
            </div>
            {saved && (
              <div className="sw-cell">
                <dt>Saved</dt>
                <dd>{saved}</dd>
              </div>
            )}
          </dl>
          <div className="sw-rail">
            <span className="sw-plateseal">Pl. {plate(index)}</span>
          </div>
        </div>
        <div className="sw-actions">
          <Link href={`/events/${event.slug}`} onClick={stop} tabIndex={open ? 0 : -1} className="sw-act-primary">
            Open event
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          {hasGeom && (
            <a
              href={googleMapsDirections(event.geom.lat, event.geom.lng)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stop}
              tabIndex={open ? 0 : -1}
              className="sw-act-quiet"
            >
              Directions
            </a>
          )}
          {event.ticket_url && (
            <a
              href={event.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stop}
              tabIndex={open ? 0 : -1}
              className="sw-act-quiet"
              style={{ marginLeft: "auto" }}
            >
              Tickets
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SavedEventWallet({
  events,
  savedAt,
  now,
  startRaised = false, // decks always start fully closed unless a caller opts in
}: {
  events: Event[];
  /** saved_at ISO per event slug, for the stub ledger's Saved cell. */
  savedAt?: Record<string, string>;
  /** One render-stable "now" from the page, for the live-now gate. */
  now: Date;
  /** Whether the top card starts raised (true for the active deck, false for
   *  the calm past archive so it stays fully tucked). */
  startRaised?: boolean;
}) {
  // One card raised at a time (accordion), keyed by slug so a re-sort keeps
  // the SAME card raised. The active deck opens on its top card; the past
  // deck opens on nothing.
  const [openSlug, setOpenSlug] = useState<string | null>(startRaised ? events[0]?.slug ?? null : null);
  if (events.length === 0) return null;
  const openValid = events.some((e) => e.slug === openSlug);
  return (
    <div className="sw-stack" role="list" aria-label="Saved events, as a card wallet">
      {events.map((e, i) => {
        const open = openValid ? e.slug === openSlug : startRaised && i === 0;
        return (
          // The SLOT carries the stack geometry (the -124px tuck + raise); it
          // must live on this wrapper, not .sw-card (the shipped first-child
          // bug the place wallet documents). Distinct id prefix from places.
          <div
            role="listitem"
            key={`${e.slug}-${e.starts_at}`}
            id={`swe-slot-${e.slug}`}
            className={`sw-slot${open ? " is-open" : ""}`}
          >
            <Card
              event={e}
              index={i}
              open={open}
              savedAt={savedAt?.[e.slug]}
              now={now}
              onOpen={() => setOpenSlug(e.slug)}
            />
          </div>
        );
      })}
    </div>
  );
}
