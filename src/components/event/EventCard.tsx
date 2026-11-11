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
import TrustChip from "@/components/ui/TrustChip";
import { Chip } from "@/components/ui/Chip";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventReasons } from "@/lib/event-reasons";
import { eventTrust } from "@/lib/trust";
import { formatDistance } from "@/lib/geo";
import { statusLabel } from "@/lib/event-status";
import DatePlate from "@/components/event/DatePlate";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import type { EventCardVisual } from "@/components/event/eventVisuals";
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
  venuePhotos: _venuePhotos = "all-approved",
}: {
  event: EventWithMeta;
  /**
   * Layout density, smallest → largest editorial weight:
   *   `utility` — TINY one-line muted row (civic meetings, recurring
   *     pickups, municipal notices). No photo, no chips. The long tail.
   *   `compact` — single-line Rolodex row (date pill + title + meta).
   *   `discovery` — photo-forward Recommended preview, using reviewed free media.
   *   `glance`  — the default ~108px browsing card. Anchored by a left
   *     accent rail + a centered category icon on a tonal tile.
   *   `row`     — legacy list card with full chip row + actions.
   *   `tile`    — grid/rail card, date-led header + category band.
   *   `feature` — HERO: date-led editorial lead, one per surface.
   *
   * Photo Policy (amended 2026-06-16): the glance / default card shows the
   * venue's hero photo when the event has one (events borrow their venue's
   * image), with the category-icon tile as the fallback. The date block still
   * leads the text; the dense variants (utility / compact) stay photoless so
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
  // Badge palette: red for cancelled, amber for postponed.
  // Text-safe status color. Plain --app-warning (amber) fails WCAG AA both as
  // inline text on cream and as white-on-fill badge; --app-warning-press is the
  // darkened AA-safe variant (white clears 4.5:1 on it, and it clears 4.5:1 as
  // text on cream). Cancelled already uses --app-danger, which passes. This one
  // value feeds every status spot below (inline text + white pills). (audit a11y)
  const statusBg = isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
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

  // PLAIN TOOL: events carry no photographs, so both browsing variants are
  // one typographic row. A time column in tabular numerals leads, then the
  // title and one muted location line. Supporting facts follow in one line.
  const rowExtras = [
    event.is_recurring && event.recurrence_text ? event.recurrence_text : null,
    event.is_free ? "Free" : event.price_text || null,
    accessLabel || null,
    event.distance_m !== undefined ? `${formatDistance(event.distance_m)} away` : null,
  ].filter(Boolean) as string[];
  if (variant === "discovery" || variant === "glance") {
    return (
      <EventRow
        slug={event.slug}
        title={displayTitle}
        weekday={date.weekday}
        month={date.month}
        day={date.day}
        startTime={date.time}
        timing={timingText}
        category={categoryLabel}
        live={confirmedLive}
        status={statusText}
        statusColor={statusForeground}
        cancelled={isCancelled}
        where={venueLabel}
        extra={rowExtras.length > 0 ? (
          <p className="mt-1 text-[13px] leading-snug tabular-nums" style={{ color: "var(--app-ink-2)" }}>
            {rowExtras.join(" · ")}
          </p>
        ) : null}
      />
    );
  }

  // Utility variant — TINY single muted line for the civic / municipal
  // long tail: board meetings, recurring pickups, posted notices. One
  // calm row, anchored by a small category-tinted dot, with the date +
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
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px]"
          style={{
            background: `color-mix(in srgb, var(--app-list-fact-color, ${accent}) 14%, var(--app-bg-sunken))`,
            color: `var(--app-list-fact-color, ${accent})`,
          }}
        >
          <CategoryIcon slug={event.category} className="h-3.5 w-3.5" strokeWidth={2} />
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
        className="tactile-interactive group relative flex items-center gap-3 border-b px-3 py-2 transition-transform duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)] hover:scale-[1.02] active:scale-[0.98]"
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
                  <span style={{ color: "var(--app-list-fact-color, var(--app-positive))" }}>Free</span>
                </>
              )}
              {accessLabel && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-list-fact-color, var(--app-cool))" }}>{accessLabel}</span>
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

  // Tile variant — the workhorse grid card, now date-led (no photo
  // banner). A category-tinted header strip carries the calendar date
  // block + category + status; the body holds title, time/venue, and the
  // reason chips. The category color stays the through-line so a music
  // tile reads differently from a planning meeting at a glance.
  if (variant === "tile") {
    // Folder-tab card: the category rides a colored TAB on the top-left
    // (deepened toward ink so white reads AA on light accents), the card's
    // top-left corner squares to meet it, and the old inline label + bottom
    // color band are gone — the tab IS the category now. The wrapper reserves
    // the tab's height so it never clips inside a rail (no parent change).
    const tabBg = `var(--app-list-header-bg, color-mix(in srgb, ${accent} 68%, var(--app-media-ink)))`;
    const reasons = eventReasons(event, cardNow ?? undefined);
    return (
      <div className="relative flex h-full flex-col pt-[14px]">
        <span
          className="absolute left-3 top-0 z-10 max-w-[75%] truncate rounded-t-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ background: tabBg, boxShadow: "var(--app-edge)", color: "var(--app-list-header-ink, var(--app-on-brand))" }}
        >
          {confirmedLive ? "Live now" : categoryLabel}
        </span>
        {/* Compact horizontal layout — date block beside the content, no empty
            header band, no bottom-pinned reasons. h-full/flex-1: in a flex
            rail the wrapper stretches to the tallest sibling anyway, so the
            card fills it — otherwise a two-line neighbor leaves this tile
            floating over a blank band. */}
        <article
          {...decisionAttributes}
          className="tactile tactile-interactive group relative flex flex-1 gap-3 overflow-hidden rounded-[var(--app-radius-lg)] rounded-tl-none border bg-[var(--app-bg-elevated)] px-3 pb-3 pt-2.5 transition-all duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
          style={{
            borderColor: "var(--app-border)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          {/* Faint engraved category glyph — paper texture + a distinct
              printed-calendar identity, the way the intel records carry one. */}
          <span aria-hidden className="pointer-events-none absolute -bottom-4 -right-3" style={{ color: accent, opacity: 0.06 }}>
            <CategoryIcon slug={event.category} className="h-[88px] w-[88px] rotate-[8deg]" strokeWidth={0.9} />
          </span>
          <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent={`var(--app-list-fact-color, ${accent})`} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {statusText && (
              <span className="self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: statusBg }}>{statusText}</span>
            )}
            <Link
              href={`/events/${event.slug}`}
              data-decision-action="open"
              prefetch={false}
              className={`line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
              style={{ color: "var(--app-ink)" }}
            >
              <span className="absolute inset-0" aria-hidden />
              {displayTitle}
            </Link>
            <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-2)" }}>{timingText}</span>
              {venueLabel ? <> · {venueLabel}</> : null}
            </p>
            {accessLabel && (
              <p className="truncate text-[11px] font-medium" style={{ color: "var(--app-cool)" }}>
                {accessLabel}
              </p>
            )}
            {reasons.length > 0 ? (
              <div className="pt-0.5"><ReasonChipRow reasons={reasons} /></div>
            ) : (event.price_text && !event.is_free) || event.distance_m !== undefined ? (
              <div className="flex items-center gap-1.5 pt-0.5 text-[11px]">
                {event.price_text && !event.is_free && (
                  <span style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>
                )}
                {event.distance_m !== undefined && (
                  <span className="ml-auto font-mono tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {formatDistance(event.distance_m)}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    );
  }

  return (
    <article
      {...decisionAttributes}
      className="tactile tactile-interactive group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-3 transition-transform duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)] hover:scale-[1.01] active:scale-[0.98]"
    >
      <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent={`var(--app-list-fact-color, ${accent})`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {statusText && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white"
              style={{ background: statusBg }}
            >
              {statusText}
            </span>
          )}
          <Link
            href={`/events/${event.slug}`}
            data-decision-action="open"
            prefetch={false}
            className={`text-[15px] font-semibold tracking-tight outline-none focus-visible:underline line-clamp-2 ${isCancelled ? "line-through opacity-70" : ""}`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {displayTitle}
          </Link>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
          <span className="font-mono tabular-nums">{timingText}</span>{venueLabel ? ` · ${venueLabel}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {cat && (
            <Chip color={cat.color} className="uppercase tracking-wide">
              {cat.name}
            </Chip>
          )}
          <TrustChip signal={eventTrust(event)} />
          {accessLabel && (
            <span className="text-[11px] font-medium" style={{ color: "var(--app-cool)" }}>
              {accessLabel}
            </span>
          )}
          {event.is_free ? (
            <span className="text-[11px] font-medium" style={{ color: "var(--app-positive)" }}>
              Free
            </span>
          ) : event.price_text && (
            <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {event.price_text}
            </span>
          )}
          {event.distance_m !== undefined && (
            <span className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {formatDistance(event.distance_m)}
            </span>
          )}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center self-start">
        <ItineraryButton eventId={event.slug} label={`Add ${displayTitle} to itinerary`} />
      </div>
    </article>
  );
}
