"use client";

/**
 * SavedEventWallet — the user's saved EVENTS as a fan of laminated cards,
 * the sibling deck of SavedWallet (places). One collection: it reuses the
 * exact .sw-* lamination / foil edge / lip / stub / tap affordance so a
 * deck of place cards above and a deck of event cards below read as the
 * same wallet, just for events (owner ask 2026-07-08).
 *
 * Neutral card faces keep event details readable in both themes. Published
 * lifecycle changes and genuinely live events keep their status treatment.
 *
 * The deck: every card tucks to a 62px lip (serif title + ONE mono fact by
 * value — "On now" beats the compact when). A dedicated disclosure control
 * raises the card (accordion, one at a time); the event title and explicit
 * action open /events/[slug].
 * The raised card tears out the same cream SPECIMEN-LABEL STUB places use,
 * where the mono ledger prints the full when, venue, town, kind, admission,
 * and saved date, plus the actions (Open event · Directions · Tickets).
 *
 * Pure presentation over already-assembled, already-sorted Events. Reuses
 * the shared event helpers (eventLipFact / eventWhenParts / eventPriceLabel,
 * built on eventDateBlock + isEventLiveNow) so no claim outruns the data.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { Event } from "@/data/events";
import { googleMapsDirections } from "@/lib/integrations/deeplinks";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { savedDateLabel } from "@/components/saved/walletFacts";
import { useToggleSave, savedChangeDescription } from "@/hooks/useSaved";
import { eventLipFact, eventPriceLabel, eventWhenParts } from "@/components/saved/eventWalletFacts";
import { statusLabel } from "@/lib/event-status";
import { withBrowseReturnTo } from "@/lib/browse-return";

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


function Card({
  event,
  open,
  savedAt,
  now,
  onToggle,
}: {
  event: Event;
  open: boolean;
  savedAt?: string;
  now: Date;
  onToggle: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[event.category];
  const town = MUNICIPALITY_BY_SLUG[event.municipality]?.name ?? null;
  const kind = cat?.name ?? "Event";
  const fact = eventLipFact(event, now);
  // Un-save from the card itself, the same device-local toggle the save
  // side wrote with. One tap, no confirm: events are device-local by
  // contract and re-saving costs one tap on the event page.
  const toggleSave = useToggleSave("event", event.slug);
  const removingRef = useRef(false);
  const [removing, setRemoving] = useState(false);
  // The app already pushes a cancellation notice to this reader's phone, and
  // /api/events/by-slugs runs a 60-second edge window specifically so a
  // cancelled row cannot sit stale in a saved deck. The card then never read
  // the field, so the notice arrived and the card still said FRI JUL 8. A
  // saved event is the one place a person is relying on the app to have
  // noticed, so this outranks the lip's normal fact.
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  // Cream ON a filled chip, not colored text. Both tokens are sized for cream
  // backgrounds (--app-danger #B4231E, --app-warning-press #7A4D12), so as
  // TEXT on this card's dark category ground they measure about 2.5:1 and
  // 2.3:1. As a fill under cream they measure 5.7:1 and 6.3:1, which is what
  // the token's own comment means by "Cream-on-warning fill".
  const statusFill =
    status === "cancelled" ? "var(--app-danger)" : "var(--app-warning-press)";
  const when = eventWhenParts(event);
  const price = eventPriceLabel(event);
  const saved = savedDateLabel(savedAt);
  const hasGeom =
    Boolean(event.geom) && Number.isFinite(event.geom.lat) && Number.isFinite(event.geom.lng);
  const dash = "Not available";

  function toggle() {
    onToggle();
    haptic("light");
    track(open ? "saved_event_wallet_collapse" : "saved_event_wallet_raise", {
      category: event.category,
    });
  }

  return (
    <div
      className={`sw-card${open ? " is-open" : ""}${fact.live ? " sw-live-card" : ""}`}
      style={{ background: "var(--app-bg-elevated-solid)" }}
    >
      {/* Same full-card motif + watermark treatment the place cards wear, so
          the two decks read as one wallet. One texture idea per card. */}
      <span className={`sw-art ${eventMotifClass(event.category)}`} aria-hidden />
      <span className="sw-glyph" aria-hidden>
        <CategoryIcon slug={event.category} className="h-full w-full" strokeWidth={1.5} />
      </span>

      <div className="sw-face">
        {/* Lockup — category glyph "logo" + serif title left. Right slot: the
            ONE mono lip fact while tucked; the category TIER wordmark on raise. */}
        <div className="sw-top">
          <Link
            href={withBrowseReturnTo(`/events/${event.slug}`, "/my-radius")}
            className="sw-brand"
            onClick={() =>
              track("saved_event_wallet_open", { category: event.category })
            }
          >
            <CategoryIcon slug={event.category} className="h-[21px] w-[21px]" strokeWidth={2.25} />
            <span className={`sw-name${statusText ? " is-struck" : ""}`}>
              {event.title}
            </span>
          </Link>
          <span className="sw-card-summary">
            {statusText ? (
              // Replaces the lip fact rather than joining it. A cancelled show
              // has no useful "when" left, and the struck title beside this
              // carries the same meaning for anyone who reads shape before text.
              <span className="sw-lipfact is-status" style={{ background: statusFill, color: "var(--app-on-brand)" }}>
                {statusText}
              </span>
            ) : (
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
              aria-controls={`swe-stub-${event.slug}`}
              aria-label={`${open ? "Hide" : "Show"} details for ${event.title}`}
              onClick={toggle}
            >
              <ChevronDown aria-hidden className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </span>
        </div>
      </div>

      {/* THE STUB — the same cream specimen label the place cards tear out,
          with the event's mono ledger printed in ink on paper. */}
      <div className="sw-stub" id={`swe-stub-${event.slug}`}>
        <div className="sw-stub-grid">
          <dl className="sw-ledger">
            <div className="sw-cell sw-cell-wide">
              {/* Past tense in the label, not a second copy of the state: the
                  lip chip and the struck title already say which state it is,
                  and a "Cancelled" label over a date would not describe its
                  own value. */}
              <dt>{statusText ? "Was" : "When"}</dt>
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
        </div>
        <div className="sw-actions">
          <Link href={withBrowseReturnTo(`/events/${event.slug}`, "/my-radius")} className="sw-act-primary">
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
              className="sw-act-quiet"
            >
              Tickets
            </a>
          )}
          <button
            type="button"
            onClick={async () => {
              if (removingRef.current) return;
              removingRef.current = true;
              setRemoving(true);
              try {
                if (await toggleSave(false)) throw new Error("Removal not confirmed");
                haptic("light");
              } catch (error) {
                toast.error("Could not remove from Saved", { description: savedChangeDescription(error) });
              } finally {
                setRemoving(false);
                removingRef.current = false;
              }
            }}
            disabled={removing}
            aria-busy={removing}
            className="sw-act-quiet"
            style={{ marginLeft: "auto" }}
            aria-label={`Remove ${event.title} from saved`}
          >
            {removing ? "Removing…" : "Remove"}
          </button>
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
  openSlug: controlledSlug,
  onOpenSlug,
}: {
  events: Event[];
  /** saved_at ISO per event slug, for the stub ledger's Saved cell. */
  savedAt?: Record<string, string>;
  /** One render-stable "now" from the page, for the live-now gate. */
  now: Date;
  /** Whether the top card starts raised (true for the active deck, false for
   *  the calm past archive so it stays fully tucked). */
  startRaised?: boolean;
  openSlug?: string | null;
  onOpenSlug?: (slug: string | null) => void;
}) {
  // One card raised at a time (accordion), keyed by slug so a re-sort keeps
  // the SAME card raised. The active deck opens on its top card; the past
  // deck opens on nothing.
  const [internalSlug, setInternalSlug] = useState<string | null>(startRaised ? events[0]?.slug ?? null : null);
  const openSlug = controlledSlug === undefined ? internalSlug : controlledSlug;
  const setOpenSlug = (slug: string | null) => {
    if (controlledSlug === undefined) setInternalSlug(slug);
    onOpenSlug?.(slug);
  };
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
              open={open}
              savedAt={savedAt?.[e.slug]}
              now={now}
              onToggle={() => setOpenSlug(open ? null : e.slug)}
            />
          </div>
        );
      })}
    </div>
  );
}
