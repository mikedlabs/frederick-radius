import Link from "next/link";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import {
  Activity, Apple, Baby, Beer, Building2, CalendarDays, Church, Coffee,
  Heart, Landmark, Library, Music, Palette, ShoppingBag, Theater, Trees,
  Users, Utensils, Vote, type LucideIcon,
} from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SaveButton from "@/components/saved/SaveButton";
import EventActions from "@/components/event/EventActions";
import TrustChip from "@/components/ui/TrustChip";
import { Chip } from "@/components/ui/Chip";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventReasons } from "@/lib/event-reasons";
import { eventTrust } from "@/lib/trust";
import { formatDistance } from "@/lib/geo";
import { statusLabel } from "@/lib/event-status";

// Small Lucide icon for the no-photo glance / utility tile. A focused
// subset of the category taxonomy's icon names (the ones that actually
// appear on event surfaces) → component, so a photo-less row gets a
// real, centered category glyph on a tonal tile instead of the cropped
// 64px CategoryGraphic that read as a broken image. Anything unmapped
// resolves to a calendar mark — honest and never broken.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Activity, Apple, Baby, Beer, Building2, Church, Coffee, Heart, Landmark,
  Library, Music, Palette, ShoppingBag, Theater, Trees, Users, Utensils,
  Vote,
};
/** Module-scope render component (NOT a render-time alias — that resets
 *  state and trips react-hooks/static-components). Resolves the
 *  category's Lucide glyph and renders it; unmapped → calendar mark. */
function CategoryIcon({
  category,
  className,
  strokeWidth = 1.75,
}: {
  category: string;
  className?: string;
  strokeWidth?: number;
}) {
  const name = CATEGORY_BY_SLUG[category]?.icon;
  const Glyph = (name && CATEGORY_ICON[name]) || CalendarDays;
  return <Glyph className={className} strokeWidth={strokeWidth} />;
}

export default function EventCard({
  event,
  variant = "glance",
  live = false,
  whyItMatters,
}: {
  event: EventWithMeta;
  /**
   * Layout density, smallest → largest editorial weight:
   *   `utility` — TINY one-line muted row (civic meetings, recurring
   *     pickups, municipal notices). No photo, no chips. The long tail.
   *   `compact` — single-line Rolodex row (date pill + title + meta).
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
  variant?: "row" | "tile" | "feature" | "compact" | "glance" | "utility";
  /** Live right now — renders a small pulsing dot in the compact row so
   *  "happening now" reads even in the dense listing. */
  live?: boolean;
  /**
   * One honest "why it matters" line for the HERO (feature) card,
   * derived upstream from the event's real description — never
   * fabricated. Rendered under the meta row. Ignored by other variants.
   */
  whyItMatters?: string;
}) {
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  // Lifecycle status — a cancelled or postponed event still shows
  // (a user looking for it needs to KNOW), but with a loud badge and
  // a struck-through title so it can never be mistaken for "on."
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  // Badge palette: red for cancelled, amber for postponed.
  const statusBg = isCancelled ? "var(--app-danger)" : "var(--app-warning)";
  // Accent MUST be a hex literal — used in templates like `${accent}38`
  // to compose color-with-alpha. A CSS var() fallback would produce
  // invalid CSS. An unrecognized/blank category resolves to a NEUTRAL
  // grey + the honest label "Event" — never the civic blue + "Civic",
  // which mislabeled every uncategorized concert and market as civic
  // business and made the feed read inconsistent (the "everything looks
  // Civic" bug). A wrong label is worse than a neutral one.
  const accent: string = cat?.color ?? "#7A7975";
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Event");

  // Utility variant — TINY single muted line for the civic / municipal
  // long tail: board meetings, recurring pickups, posted notices. One
  // calm row, anchored by a small category-tinted dot, with the date +
  // time set quietly to the right. No photo, no chips, no actions —
  // present and scannable, never competing with the events people came
  // for. This is the "muted line" the tier brief asks for.
  if (variant === "utility") {
    return (
      <article
        className="group relative flex items-center gap-2.5 border-b px-1.5 py-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px]"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, var(--app-bg-sunken))`,
            color: accent,
          }}
        >
          <CategoryIcon category={event.category} className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <Link
          href={`/events/${event.slug}`}
          className={`min-w-0 flex-1 truncate text-[13px] outline-none focus-visible:underline ${
            isCancelled ? "line-through opacity-70" : ""
          }`}
          style={{ color: "var(--app-ink-2)" }}
        >
          <span className="absolute inset-0" aria-hidden />
          {event.title}
          {event.venue_name && (
            <span style={{ color: "var(--app-ink-3)" }}> · {event.venue_name}</span>
          )}
        </Link>
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {statusText && (
            <span className="font-semibold" style={{ color: statusBg }}>{statusText} · </span>
          )}
          {date.weekday} {date.month} {date.day}
          {date.time ? ` · ${date.time}` : ""}
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
        className="tactile-interactive group relative flex items-center gap-3 border-b px-3 py-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Date / time pill — anchors each row. Date numerals first
            so a scan-by-day pattern works. Smaller text for venue
            time below if we have it. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5 leading-none">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ color: accent }}
          >
            {date.month}
          </span>
          <span
            className="font-serif text-[17px] font-semibold"
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
            When the event is live right now it pulses on the positive
            green so "happening now" reads even in the dense listing. */}
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full${live ? " live-dot" : ""}`}
          style={{ background: live ? "var(--app-positive)" : accent }}
          title={live ? "Live now" : categoryLabel}
        />

        {/* Title + meta — title is the link target, meta line below
            carries time + venue + free chip. Status badge inline
            when the event is cancelled / postponed (rare). */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/events/${event.slug}`}
            className={`block truncate text-[14px] font-semibold tracking-tight outline-none focus-visible:underline ${
              isCancelled ? "line-through opacity-70" : ""
            }`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
          <p
            className="truncate text-[11px] leading-tight"
            style={{ color: "var(--app-ink-3)" }}
          >
            <span className="font-mono tabular-nums">{date.time}</span>
            {event.venue_name && (
              <>
                {" · "}
                {event.venue_name}
              </>
            )}
            {event.is_free && (
              <>
                {" · "}
                <span style={{ color: "var(--app-positive)" }}>Free</span>
              </>
            )}
            {statusText && (
              <>
                {" · "}
                <span style={{ color: statusBg }}>{statusText}</span>
              </>
            )}
          </p>
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

  // Feature variant — the editorial lead card for a horizon group. A
  // date-led typographic hero: a big calendar block anchors it, the serif
  // title leads, "why it matters" gives the editorial reason. No photo —
  // the event is the calendar entry, not a borrowed venue shot.
  if (variant === "feature") {
    const reasons = eventReasons(event);
    return (
      <article
        className="tactile tactile-feature tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
        style={{ boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
      >
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
        <div className="flex items-start gap-3.5 p-4">
          {/* Calendar date block — the editorial anchor. */}
          <div
            aria-hidden
            className="flex shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] px-3 py-2 leading-none"
            style={{
              minWidth: 60,
              background: `color-mix(in srgb, ${accent} 12%, var(--app-bg-sunken))`,
              boxShadow: "var(--app-edge), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{date.month}</span>
            <span className="font-serif text-[27px] font-semibold" style={{ color: "var(--app-ink)" }}>{date.day}</span>
            <span className="text-[10px] font-medium uppercase" style={{ color: "var(--app-ink-3)" }}>{date.weekday}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>{categoryLabel}</span>
              {statusText && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: statusBg }}>{statusText}</span>
              )}
              {event.distance_m !== undefined && (
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{formatDistance(event.distance_m)}</span>
              )}
            </div>
            <Link
              href={`/events/${event.slug}`}
              className={`mt-0.5 block font-serif text-[19px] font-semibold leading-tight tracking-tight outline-none focus-visible:underline line-clamp-2 ${isCancelled ? "line-through opacity-70" : ""}`}
              style={{ color: "var(--app-ink)" }}
            >
              <span className="absolute inset-0" aria-hidden />
              {event.title}
            </Link>
            {/* WHEN — the temporal token in mono (design-system thesis). */}
            <p className="mt-1 truncate text-[13px]" style={{ color: "var(--app-ink-2)" }}>
              {date.time && <span className="font-mono tabular-nums">{date.time}</span>}
              {date.time && event.venue_name ? " · " : ""}
              {event.venue_name}
            </p>
            {/* "In their words" — one honest line lifted from the event's own
                description, never fabricated. A plain caption, not editorial
                serif-italic: it is the source's sentence, not the guide's. */}
            {whyItMatters && (
              <div className="mt-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                  In their words
                </span>
                <p className="line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                  {whyItMatters}
                </p>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {reasons.length > 0 ? (
                <ReasonChipRow reasons={reasons} />
              ) : (
                <>
                  {event.is_free && <span className="text-[11px] font-semibold" style={{ color: "var(--app-positive)" }}>Free</span>}
                  {event.price_text && !event.is_free && <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>}
                </>
              )}
            </div>
          </div>
        </div>
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
    const tabBg = `color-mix(in srgb, ${accent} 82%, var(--app-ink))`;
    const reasons = eventReasons(event);
    return (
      <div className="relative pt-[14px]">
        <span
          className="absolute left-3 top-0 z-10 max-w-[75%] truncate rounded-t-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white"
          style={{ background: tabBg, boxShadow: "var(--app-edge)" }}
        >
          {live ? "Live now" : categoryLabel}
        </span>
        {/* Compact horizontal layout — date block beside the content, no empty
            header band, no bottom-pinned reasons. The card hugs its content
            (no h-full stretch) so a rail of these wastes no vertical space. */}
        <article
          className="tactile tactile-interactive group relative flex gap-3 overflow-hidden rounded-[var(--app-radius-lg)] rounded-tl-none border bg-[var(--app-bg-elevated)] px-3 pb-3 pt-2.5"
          style={{
            borderColor: "var(--app-border)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          <div
            aria-hidden
            className="flex shrink-0 flex-col items-center justify-center self-start rounded-[var(--app-radius-sm)] px-2 py-1 leading-none"
            style={{ minWidth: 46, background: `color-mix(in srgb, ${accent} 12%, var(--app-bg-sunken))`, boxShadow: "var(--app-edge), inset 0 1px 0 rgba(255,255,255,0.45)" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>{date.month}</span>
            <span className="font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>{date.day}</span>
            <span className="text-[9px] font-medium uppercase" style={{ color: "var(--app-ink-3)" }}>{date.weekday}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {statusText && (
              <span className="self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: statusBg }}>{statusText}</span>
            )}
            <Link
              href={`/events/${event.slug}`}
              className={`line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
              style={{ color: "var(--app-ink)" }}
            >
              <span className="absolute inset-0" aria-hidden />
              {event.title}
            </Link>
            <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-2)" }}>{date.time}</span>
              {event.venue_name ? <> · {event.venue_name}</> : null}
            </p>
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

  // Glance variant — the new default browsing card per the mobile
  // review. ~108px tall, photo-less, designed so 2.5-3 cards are
  // visible at once on a 700px mobile viewport. Layout:
  //
  //   ┌────────────────────────────────────────────┐
  //   │ THU · MAY 28                       5:00 PM │  ← top row
  //   │                                            │
  //   │ Alive @ Five · The Learned Doctors         │  ← title
  //   │ Carroll Creek Amphitheater                 │  ← venue
  //   │                                            │
  //   │ Live Music · $5 · 21+                      │  ← meta row
  //   └────────────────────────────────────────────┘
  //
  // The reviewer's spec was the trigger for adding this variant;
  // the old "row" with its 64px thumbnail + chip row sits at ~150px
  // and broke the "2.5-3 cards per viewport" target.
  //
  // The image is OPTIONAL by design (the reviewer's exact word) —
  // browsing scans on text, then opens the detail page for visuals.
  // Save / share actions also move to the detail page; the glance
  // card is a Link to the event, full stop.
  if (variant === "glance") {
    return (
      <article
        className="tactile tactile-interactive group relative rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3"
        style={{
          borderColor: "var(--app-border)",
          // Faint left-edge accent in the category color so a stack
          // of cards reads as "different kinds of events" at a
          // glance without adding the visual weight of a chip.
          boxShadow: `inset 3px 0 0 ${accent}`,
        }}
      >
        <Link
          href={`/events/${event.slug}`}
          aria-label={
            date.time
              ? `${event.title} on ${date.weekday} ${date.month} ${date.day} at ${date.time}`
              : `${event.title} on ${date.weekday} ${date.month} ${date.day}`
          }
          className={`block outline-none ${isCancelled ? "line-through opacity-70" : ""}`}
          style={{ color: "var(--app-ink)" }}
        >
          {/* Absolute click target — keeps every part of the card
              tappable while the inner spans render at normal text
              flow. Standard Apple-cards pattern. */}
          <span className="absolute inset-0" aria-hidden />
          <div className="flex items-stretch gap-3">
            <div className="min-w-0 flex-1">
              {/* WHAT leads. A stack of glance cards should read as a column
                  of titles, not a column of identical clock times — the
                  group header ("On tonight", "This weekend") already carries
                  the rough WHEN, so each card answers "what" first. (Reverses
                  the old time-first glance, which buried the title.) */}
              <h3
                className="text-[15px] font-semibold leading-snug tracking-tight line-clamp-2"
                style={{ color: "var(--app-ink)" }}
              >
                {event.title}
              </h3>
              {/* WHEN — supporting mono data (the design-system thesis on the
                  temporal token). A live dot + "Now" when it's happening
                  right now. Time-or-weekday so a (future) null all-day time
                  leads with the weekday, never a bare "12:00 AM". */}
              <p
                className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {live && (
                  <span
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: "var(--app-positive)" }}
                  >
                    <span
                      aria-hidden
                      className="live-dot h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--app-positive)" }}
                    />
                    Now
                    <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
                  </span>
                )}
                <span>
                  {date.weekday} {date.month} {date.day}
                  {date.time ? ` · ${date.time}` : ""}
                </span>
                {statusText && (
                  <span className="font-medium" style={{ color: statusBg }}>
                    · {statusText}
                  </span>
                )}
              </p>
              {/* Venue line — small, calm, single-line truncate. */}
              {event.venue_name && (
                <p
                  className="mt-0.5 truncate text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {event.venue_name}
                </p>
              )}
              {/* Meta row — price/free + distance only. The category WORD is
                  dropped: the left accent rail + the icon tile already encode
                  the kind, so naming it again was redundant chrome. */}
              {(event.is_free || event.price_text || event.distance_m !== undefined) && (
                <div className="mt-2 flex items-center gap-x-2 text-[11px]">
                  {event.is_free ? (
                    <span style={{ color: "var(--app-positive)" }}>Free</span>
                  ) : event.price_text ? (
                    <span style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>
                  ) : null}
                  {event.distance_m !== undefined && (
                    <span
                      className="ml-auto font-mono tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {formatDistance(event.distance_m)}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Trailing visual anchor — the venue's photo when the event
                carries one (events borrow their venue's hero), else a
                centered category icon on a tonal tile. The left accent rail
                still encodes the kind; the photo just gives the row a face. */}
            {event.hero_image ? (
              <div aria-hidden className="relative h-12 w-12 shrink-0 self-center overflow-hidden rounded-[12px]">
                <Image
                  src={event.hero_image}
                  alt=""
                  width={96}
                  height={96}
                  sizes="48px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 rounded-[12px]" style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.10)" }} />
              </div>
            ) : (
              <div
                aria-hidden
                className="grid h-12 w-12 shrink-0 self-center place-items-center rounded-[12px]"
                style={{
                  background: `color-mix(in srgb, ${accent} 14%, var(--app-bg-sunken))`,
                  color: accent,
                  boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.06)",
                }}
              >
                <CategoryIcon category={event.category} className="h-5 w-5" />
              </div>
            )}
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article className="tactile tactile-interactive group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-3">
      <div
        className="relative flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: "var(--app-border)",
          background: `color-mix(in srgb, ${accent} 10%, var(--app-bg-sunken))`,
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {date.month}
        </span>
        <span className="font-serif text-xl font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
          {date.day}
        </span>
        <span className="mt-0.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
          {date.weekday}
        </span>
      </div>
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
            className={`text-[15px] font-semibold tracking-tight outline-none focus-visible:underline line-clamp-2 ${isCancelled ? "line-through opacity-70" : ""}`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
          <span className="font-mono tabular-nums">{date.time}</span> · {event.venue_name}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {cat && (
            <Chip color={cat.color} className="uppercase tracking-wide">
              {cat.name}
            </Chip>
          )}
          <TrustChip signal={eventTrust(event)} />
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
        <EventActions event={event} />
        <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
      </div>
    </article>
  );
}
