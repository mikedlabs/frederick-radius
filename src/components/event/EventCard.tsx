import Link from "next/link";
import CategoryIcon from "@/components/place/CategoryIcon";
import type { EventWithMeta } from "@/lib/loaders/events";
// VALUE import from the DATA-FREE formatter module, never from the loader:
// a value import of loaders/events would drag its places-client static
// import (1.8MB JSON) into every client bundle that renders an event card.
import { eventDateBlock } from "@/lib/events/format";
import { eventDisplayTitle } from "@/lib/events/display-title";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import ItineraryButton from "@/components/saved/ItineraryButton";
import { eventReasons } from "@/lib/event-reasons";
import { eventTrust } from "@/lib/trust";
import { formatDistance } from "@/lib/geo";
import { statusLabel } from "@/lib/event-status";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import { eventCardVisual, type EventCardVisual } from "@/components/event/eventVisuals";
import EventRowMedia from "@/components/event/EventRowMedia";
import EventPosterCard from "@/components/event/EventPosterCard";
import EventRow from "@/components/event/EventRow";
import {
  eventHasTrustworthyEnd,
  isEventLiveNow,
} from "@/lib/eventWhenLabel";

// Event cards use the SHARED CategoryIcon seam (place/CategoryIcon): it resolves
// the bespoke engraved woodcut glyph for a category first, then a Lucide vector,
// so an event card gets the same hand-drawn field-guide mark a place card does
// instead of a generic Lucide icon. (Replaced the local Lucide-only map.)

export default function EventCard({
  event,
  variant = "glance",
  live = false,
  hideDate = false,
  whyItMatters,
  priorityImage = true,
  visual,
  nowISO,
  venuePhotos = "all-approved",
  showDate = true,
  headingLevel = 2,
}: {
  event: EventWithMeta;
  /**
   * Layout density, from smallest to largest editorial weight:
   *   `utility`: TINY one-line muted row (civic meetings, recurring
   *     pickups, municipal notices). No photo, no chips. The long tail.
   *   `compact`: single-line Rolodex row (date pill + title + meta).
   *   `discovery`: photo-forward Recommended preview, using reviewed free media.
   *   `glance`: the default browsing row: time column, title, venue,
   *     and an approved picture or the category glyph at the right.
   *   `row`: the same row plus its trust label and the Save control.
   *   `tile`: the same row plus its reasons as plain text.
   *   `feature`: the page lead, with the coral time block, one per surface.
   *
   * Photo Policy (amended 2026-06-16): the glance / default row shows the
   * venue's hero photo when the event has one (events borrow their venue's
   * image), with the unboxed category glyph as the fallback. The time column
   * still leads; the dense variants (utility / compact) stay photoless so
   * the long tail reads as a calm list. See docs/PHOTO_POLICY.md.
   */
  variant?: "row" | "tile" | "feature" | "compact" | "glance" | "discovery" | "utility";
  /** Live right now — renders a small pulsing dot in the compact row so
   *  "happening now" reads even in the dense listing. */
  live?: boolean;
  /**
   * The surface's own header already names the day ("Also today",
   * "Earlier today"), so the utility row prints only the clock — repeating
   * "Tue Jul 15" on every row of a today-only list is dead ink that steals
   * width from the title. Utility variant only; other variants ignore it.
   */
  hideDate?: boolean;
  /**
   * One honest "why it matters" line for the HERO (feature) card,
   * derived upstream from the event's real description — never
   * fabricated. Rendered under the meta row. Ignored by other variants.
   */
  whyItMatters?: string;
  /**
   * Whether a feature-variant photo may claim next/image `priority`
   * (the LCP preload). Defaults true (the historical single-hero
   * behavior); pass false for feature cards below the fold now that a
   * page can carry one photo lead PER horizon group — multiple priority
   * images compete for bandwidth and hurt the real LCP.
   */
  priorityImage?: boolean;
  /**
   * A source-aware visual selected by the events surface. This may be a
   * clearly labeled photograph of the venue rather than an event image.
   */
  visual?: EventCardVisual;
  /** Server-captured page time, used for stable started/unknown-end copy. */
  nowISO?: string;
  /** Supplementary-card policy; discovery always uses free reviewed media. */
  venuePhotos?: "all-approved" | "free-reviewed";
  /** Row variants only: hide the day line when the row above shows the same day. */
  showDate?: boolean;
  /** Feature only: h2 when the lead stands under the page title, h3 inside a
   * group section that already has its own h2. */
  headingLevel?: 2 | 3;
}) {
  const displayTitle = eventDisplayTitle(event);
  const status = event.status ?? "scheduled";
  const cardNow = nowISO ? new Date(nowISO) : null;
  // Presentation-level guard: even if a stale caller passes `live`, a card
  // cannot render Live/Now unless the event carries a usable end time.
  const confirmedLive =
    status === "scheduled" &&
    live &&
    (cardNow
      ? isEventLiveNow(event, cardNow)
      : !event.is_all_day && eventHasTrustworthyEnd(event));

  // A lead uses a source-approved image when available and a compact date-led
  // card otherwise. An unapproved image never bypasses the shared photo gate.
  if (variant === "feature") {
    return (
      <EventPosterCard
        event={event}
        visual={visual}
        priorityImage={priorityImage}
        whyItMatters={whyItMatters}
        live={confirmedLive}
        nowISO={nowISO}
        headingLevel={headingLevel}
      />
    );
  }

  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  // Lifecycle status — a cancelled or postponed event still shows
  // (a user looking for it needs to KNOW), but with a loud badge and
  // a struck-through title so it can never be mistaken for "on."
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const timingText = eventDecisionTime(event, cardNow ?? undefined);
  // Text-safe status color: red for cancelled, the closing amber for
  // postponed. Status is inline text in every row, never a filled badge.
  const statusForeground = isCancelled ? "var(--app-danger-text)" : "var(--state-closing)";
  const venueLabel = eventDecisionLocation(event);
  // Accent MUST be a hex literal — used in templates like `${accent}38`
  // to compose color-with-alpha. A CSS var() fallback would produce
  // invalid CSS. An unrecognized/blank category resolves to a NEUTRAL
  // grey + the honest label "Event" — never the civic blue + "Civic",
  // which mislabeled every uncategorized concert and market as civic
  // business and made the feed read inconsistent (the "everything looks
  // Civic" bug). A wrong label is worse than a neutral one.
  const accent: string = cat?.color ?? "#7A7975";
  // AA-safe variant of the category hue for use as small TEXT (uppercase
  // eyebrows) on cream/card: mix the vivid color toward ink so it clears 4.5:1
  // while staying recognizably the category's hue. The raw `accent` stays for
  // icon fills / tint grounds (3:1 domain). (audit a11y: category eyebrows)
  const accentText = `var(--app-list-fact-color, color-mix(in srgb, ${accent} 55%, var(--app-ink)))`;
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Event");
  const accessLabel = communicationAccessLabels(event)[0];
  const decisionAttributes = {
    "data-decision-impression": "true",
    "data-decision-surface": "events",
    "data-decision-entity": "event",
    "data-decision-id": event.slug,
    "data-decision-position": "result",
  } as const;

  // PLAIN TOOL: most events carry no photographs, so every browsing variant
  // is one typographic row. A time column in tabular numerals leads, then the
  // title and one muted location line. An approved venue photo or publisher
  // artwork keeps its place as a small square at the right of the row; a row
  // without one shows the category glyph in that slot. The legacy "tile" and
  // "row" variants are the same row: "tile" adds its reasons as plain text and
  // "row" adds its trust label and the Save control.
  if (variant === "discovery" || variant === "glance" || variant === "tile" || variant === "row") {
    const cardVisual = eventCardVisual(event, { venuePhotos: variant === "discovery" ? "free-reviewed" : venuePhotos });
    // Reasons are informational, so they read as plain text in the facts
    // line. Free and distance are already stated there, and live state is the
    // row's own guarded "Happening now" label.
    const reasonLabels = variant === "tile" || variant === "row"
      ? eventReasons(event, cardNow ?? undefined)
        .filter(reason => reason.kind !== "free" && reason.kind !== "near" && reason.kind !== "walkable"
          && reason.kind !== "live_now")
        .map(reason => reason.label)
      : [];
    // Recurrence is its own line; the decision facts (price, access,
    // distance) share one muted line under it.
    const facts = [
      ...reasonLabels,
      event.is_free ? "Free" : event.price_text || null,
      accessLabel || null,
      event.distance_m !== undefined ? `${formatDistance(event.distance_m)} away` : null,
      variant === "row" ? eventTrust(event).label : null,
    ].filter(Boolean) as string[];
    const recurrence = event.is_recurring && event.recurrence_text ? event.recurrence_text : null;
    const row = {
      slug: event.slug,
      title: displayTitle,
      weekday: date.weekday,
      month: date.month,
      day: date.day,
      startTime: date.time,
      timing: timingText,
      category: categoryLabel,
      live: confirmedLive,
      status: statusText,
      statusColor: statusForeground,
      cancelled: isCancelled,
      where: venueLabel,
      showDate,
      layout: variant,
      glyph: event.category,
      action: variant === "row" ? <ItineraryButton eventId={event.slug} label={`Add ${displayTitle} to itinerary`} /> : undefined,
      extra: recurrence || facts.length > 0 ? (
        <>
          {recurrence ? <p data-event-card-recurrence className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{recurrence}</p> : null}
          {facts.length > 0 ? (
            <p className="mt-1 text-[13px] leading-snug tabular-nums" style={{ color: "var(--app-ink-2)" }}>{facts.join(" · ")}</p>
          ) : null}
        </>
      ) : null,
    };
    return cardVisual
      ? <EventRowMedia {...row} visual={cardVisual} compactCredit={variant !== "discovery"} />
      : <EventRow {...row} mediaKind="none" />;
  }

  // Utility variant — TINY single muted line for the civic / municipal
  // long tail: board meetings, recurring pickups, posted notices. One
  // calm row, anchored by a small muted category glyph, with the date +
  // time set quietly to the right. No photo, no chips, no actions —
  // present and scannable, never competing with the events people came
  // for. This is the "muted line" the tier brief asks for.
  if (variant === "utility") {
    return (
      <article
        {...decisionAttributes}
        className="group relative flex min-h-11 items-center gap-2.5 border-b px-1.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center"
          style={{ color: "var(--app-ink-3)" }}
        >
          <CategoryIcon slug={event.category} className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <Link
          href={`/events/${event.slug}`}
          data-decision-action="open"
          prefetch={false}
          className={`flex min-h-11 min-w-0 self-stretch flex-1 items-center truncate text-[13px] outline-none focus-visible:underline ${
            isCancelled ? "line-through opacity-70" : ""
          }`}
          style={{ color: "var(--app-ink-2)" }}
        >
          <span className="absolute inset-0" aria-hidden />
          {displayTitle}
          {venueLabel && (
            <span style={{ color: "var(--app-ink-3)" }}> · {venueLabel}</span>
          )}
        </Link>
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {statusText && (
            <span className="font-semibold" style={{ color: statusForeground }}>{statusText} · </span>
          )}
          {hideDate
            ? timingText
            : `${date.weekday} ${date.month} ${date.day}${timingText ? ` · ${timingText}` : ""}`}
        </span>
      </article>
    );
  }

  // Compact variant — the Rolodex row. Single ~48px line: date pill
  // (left, fixed width) + title + venue/time meta + category color
  // dot. No photo, no chips, no actions. Built for dense scanning,
  // not browsing: 4-5x more events per mobile viewport than the
  // default row variant. Surfaced via the /events density toggle.
  if (variant === "compact") {
    return (
      <article
        {...decisionAttributes}
        className="group relative flex items-center gap-3 border-b py-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Date / time pill — anchors each row. Date numerals first
            so a scan-by-day pattern works. Smaller text for venue
            time below if we have it. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5 leading-none">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ color: accentText }}
          >
            {date.month}
          </span>
          <span
            className="font-data text-[17px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            {date.day}
          </span>
          <span
            className="text-[9px] font-medium uppercase"
            style={{ color: "var(--app-ink-3)" }}
          >
            {date.weekday}
          </span>
        </div>

        {/* Category color dot — quiet visual cue tying the row to a
            type. Small enough to scan past, distinct enough that a
            shelf of compact rows shows category rhythm at a glance.
            When the event is live right now it pulses on Amber — the
            palette's live state — so "happening now" reads even in the
            dense listing without borrowing the positive green. */}
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full${confirmedLive ? " live-dot" : ""}`}
          style={{ background: confirmedLive ? "var(--app-amber)" : `var(--app-list-fact-color, ${accent})` }}
          title={confirmedLive ? "Live now" : categoryLabel}
        />

        {/* Title + meta share one 44px link target. The old title-only anchor
            relied on an invisible absolute child to stretch the hit area,
            which worked with a pointer but remained a tiny focus target in
            accessibility and audit tooling. */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/events/${event.slug}`}
            data-decision-action="open"
            prefetch={false}
            className={`flex min-h-11 min-w-0 flex-col justify-center outline-none after:absolute after:inset-0 focus-visible:underline ${
              isCancelled ? "line-through opacity-70" : ""
            }`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="block line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">
              {displayTitle}
            </span>
            <span
              className="block text-[12px] font-normal leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              <span className="font-mono tabular-nums">{timingText}</span>
              {venueLabel && (
                <>
                  {" · "}
                  {venueLabel}
                </>
              )}
              {event.is_free && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-list-fact-color, var(--app-forest-text))" }}>Free</span>
                </>
              )}
              {accessLabel && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-list-fact-color, var(--app-cool-text))" }}>{accessLabel}</span>
                </>
              )}
              {statusText && (
                <>
                  {" · "}
                  <span style={{ color: statusForeground }}>{statusText}</span>
                </>
              )}
            </span>
          </Link>
        </div>

        {/* Distance — only when we have a user origin. Tabular nums
            so a vertical scan stays aligned. */}
        {event.distance_m !== undefined && (
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {formatDistance(event.distance_m)}
          </span>
        )}
      </article>
    );
  }

  // Every variant returns above; the union is exhausted here.
  return null;
}
