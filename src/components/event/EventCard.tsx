import Link from "next/link";
import Image from "next/image";
import {
  Activity, Apple, Baby, Beer, Building2, CalendarDays, Church, Coffee,
  Heart, Landmark, Library, Music, Palette, ShoppingBag, Theater, Trees,
  Users, Utensils, Vote, type LucideIcon,
} from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import SaveButton from "@/components/saved/SaveButton";
import EventActions from "@/components/event/EventActions";
import TrustChip from "@/components/ui/TrustChip";
import { Chip } from "@/components/ui/Chip";
import CategoryGraphic from "@/components/ui/CategoryGraphic";
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
   *     accent rail; a real photo when one exists, otherwise a small
   *     centered category icon on a tonal tile (NOT the old cropped
   *     64px CategoryGraphic, which read as a broken image).
   *   `row`     — legacy list card with full chip row + actions.
   *   `tile`    — grid/rail card with a cinematic photo banner.
   *   `feature` — HERO: full-bleed editorial lead, one per surface.
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
  const statusBg = isCancelled ? "var(--app-negative, #C0392B)" : "var(--app-warning, #B8860B)";
  // Accent MUST be a hex literal — used in templates like `${accent}38`
  // to compose color-with-alpha. A CSS var() fallback would produce
  // invalid CSS. An unrecognized/blank category resolves to a NEUTRAL
  // grey + the honest label "Event" — never the civic blue + "Civic",
  // which mislabeled every uncategorized concert and market as civic
  // business and made the feed read inconsistent (the "everything looks
  // Civic" bug). A wrong label is worse than a neutral one.
  const accent: string = cat?.color ?? "#7A7975";
  const hasPhoto = Boolean(event.hero_image);
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
          className={`min-w-0 flex-1 truncate text-[12.5px] outline-none focus-visible:underline ${
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
          className="shrink-0 text-[10.5px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {date.weekday} {date.month} {date.day} · {date.time}
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
            className="text-[8.5px] font-medium uppercase"
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
            className={`block truncate text-[13.5px] font-semibold tracking-tight outline-none focus-visible:underline ${
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
            {date.time}
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
            className="shrink-0 text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {formatDistance(event.distance_m)}
          </span>
        )}
      </article>
    );
  }

  // Feature variant — the editorial lead card for a horizon group when
  // we have a real photo. Full-bleed image, big serif headline, scrim
  // overlay, date badge top-left. One per group, by design.
  if (variant === "feature") {
    return (
      <article className="tactile tactile-feature tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)]">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {hasPhoto && event.hero_image ? (
            <Image
              src={event.hero_image}
              alt=""
              fill
              sizes="(max-width: 720px) 100vw, 720px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <CategoryGraphic
              category={event.category}
              seed={event.slug}
              className="absolute inset-0"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div
            className="absolute left-3 top-3 inline-flex items-baseline gap-1.5 rounded-[var(--app-radius-sm)] bg-white/95 px-2 py-1 leading-none"
            style={{ color: accent }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {date.month}
            </span>
            <span className="font-serif text-[18px] font-semibold">{date.day}</span>
            <span className="text-[10px] font-medium opacity-80">{date.weekday}</span>
          </div>
          <span
            className="absolute right-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: accent }}
          >
            {categoryLabel}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-4">
            {statusText && (
              <span
                className="mb-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white"
                style={{ background: statusBg }}
              >
                {statusText}
              </span>
            )}
            <Link
              href={`/events/${event.slug}`}
              className={`line-clamp-2 font-serif text-[22px] font-semibold leading-tight tracking-tight text-white outline-none focus-visible:underline ${isCancelled ? "line-through opacity-80" : ""}`}
            >
              <span className="absolute inset-0" aria-hidden />
              {event.title}
            </Link>
            <p className="mt-1 truncate text-[12px] text-white/85">
              {date.time}
              {event.venue_name ? ` · ${event.venue_name}` : ""}
            </p>
            {/* "Why it matters" — one honest line, derived from the
                event's real description upstream (never fabricated).
                Only the hero card carries it; it's the editorial
                difference between "an event exists" and "here's why
                you'd go." */}
            {whyItMatters && (
              <p className="mt-1.5 line-clamp-2 font-serif text-[13px] italic leading-snug text-white/80">
                {whyItMatters}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
              {event.is_free && (
                <span
                  className="rounded-full bg-white/15 px-2 py-0.5 font-semibold backdrop-blur-sm"
                  style={{ color: "white" }}
                >
                  Free
                </span>
              )}
              {event.price_text && !event.is_free && (
                <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold backdrop-blur-sm">
                  {event.price_text}
                </span>
              )}
              {event.distance_m !== undefined && (
                <span className="ml-auto tabular-nums">
                  {formatDistance(event.distance_m)}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Tile variant — the workhorse grid card. Three modes by data shape:
  //   1. has photo: photo banner on top, date badge overlay, content below
  //   2. no photo, civic/quiet category: typographic block with color band
  //   3. no photo, marquee category: tinted gradient block
  // The category color is visible in every state, so a music event reads
  // differently from a planning meeting at a glance.
  if (variant === "tile") {
    return (
      <article className="tactile tactile-interactive group relative flex h-full flex-col overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        {/* Banner — taller (152px) and more cinematic than v1 (112).
            Photo, or category-tinted CategoryGraphic when no hero.
            Same height in both modes so a grid never wobbles. */}
        <div className="relative h-[152px] w-full overflow-hidden">
          {hasPhoto && event.hero_image ? (
            <Image
              src={event.hero_image}
              alt=""
              fill
              sizes="(max-width: 720px) 50vw, 360px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <CategoryGraphic
              category={event.category}
              seed={event.slug}
              className="absolute inset-0"
            />
          )}
          {/* Stronger bottom gradient pulls the date/status pills off
              the photo cleanly without darkening the upper image. */}
          {hasPhoto && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.65) 100%)",
              }}
            />
          )}

          {/* Date glass pill — top-left. Was a stickered white card;
              now a true glass pill with backdrop blur, sitting on the
              photo like an editorial date stamp. The category color
              tints the day number subtly so type signal carries here. */}
          <div
            className="absolute left-2 top-2 inline-flex items-baseline gap-1 rounded-full px-2 py-1 leading-none"
            style={{
              background: hasPhoto ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: hasPhoto
                ? "0 2px 6px -1px rgba(0,0,0,0.30)"
                : "inset 0 0 0 1px rgba(255,255,255,0.12)",
              color: hasPhoto ? "var(--app-ink)" : "white",
            }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: hasPhoto ? accent : "white" }}
            >
              {date.month}
            </span>
            <span
              className="font-serif text-[16px] font-semibold"
              style={{ color: hasPhoto ? "var(--app-ink)" : "white" }}
            >
              {date.day}
            </span>
            <span className="text-[10px] font-medium opacity-75">{date.weekday}</span>
          </div>

          {/* Category chip — top-right. Filled with category color
              when on a photo (the way Airbnb's "Guest favorite" chip
              calls out a status), glass when no photo so it reads
              against the CategoryGraphic. */}
          <span
            className="absolute right-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: hasPhoto ? accent : "rgba(255,255,255,0.22)",
              color: "white",
              boxShadow: hasPhoto
                ? "0 2px 6px -1px rgba(0,0,0,0.30)"
                : "inset 0 0 0 1px rgba(255,255,255,0.22)",
              backdropFilter: hasPhoto ? "none" : "blur(8px)",
              WebkitBackdropFilter: hasPhoto ? "none" : "blur(8px)",
            }}
          >
            {categoryLabel}
          </span>

          {/* Status pill — bottom-left ON THE PHOTO (the Airbnb
              pattern). Only renders when there's a real status to
              call out: Tonight / Live / Sold out / Cancelled. White
              glass on photo, colored backdrop on no-photo. */}
          {statusText && (
            <span
              className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{
                background: statusBg,
                color: "white",
                boxShadow: "0 2px 6px -1px rgba(0,0,0,0.30)",
              }}
            >
              {statusText}
            </span>
          )}

          {/* Category color band on the bottom edge — the through-line
              that makes a music tile visually distinct from a civic one. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px]"
            style={{ background: accent }}
          />
        </div>

        {/* Body — slimmer than v1. Title + meta + reasons row.
            Status pill moved onto the photo so the body stays clean. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <Link
            href={`/events/${event.slug}`}
            className={`line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
          <p className="truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            <span style={{ color: "var(--app-ink-2)" }}>{date.time}</span>
            {event.venue_name ? <> · {event.venue_name}</> : null}
          </p>
          {/* Reason chips — same producer as before. Stay below the
              meta line, capped at 3, as the decision-context row. */}
          <div className="mt-auto pt-1">
            {(() => {
              const reasons = eventReasons(event);
              if (reasons.length > 0) {
                return <ReasonChipRow reasons={reasons} />;
              }
              return (
                <div className="flex items-center gap-1.5 text-[10.5px]">
                  {event.price_text && !event.is_free && (
                    <span style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>
                  )}
                  {event.distance_m !== undefined && (
                    <span className="ml-auto tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      {formatDistance(event.distance_m)}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </article>
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
    const accentLabel = cat?.name ?? (event.category ? event.category : "Event");
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
          aria-label={`${event.title} on ${date.weekday} ${date.month} ${date.day} at ${date.time}`}
          className={`block outline-none ${isCancelled ? "line-through opacity-70" : ""}`}
          style={{ color: "var(--app-ink)" }}
        >
          {/* Absolute click target — keeps every part of the card
              tappable while the inner spans render at normal text
              flow. Standard Apple-cards pattern. */}
          <span className="absolute inset-0" aria-hidden />
          <div className="flex items-stretch gap-3">
            <div className="min-w-0 flex-1">
              {/* When — TIME-FIRST (audit D3). The clock time is the
                  dominant anchor (big serif, category accent); the
                  weekday + date ride alongside it small. A timeless event
                  leads with its weekday instead, so the lead is never
                  blank. The title drops to a secondary weight below, so
                  the card answers "when" before "what". */}
              <div className="flex items-baseline gap-2">
                <span
                  className="shrink-0 font-serif text-[19px] font-bold leading-none tabular-nums"
                  style={{ color: accent }}
                >
                  {date.time || date.weekday}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {date.time
                    ? `${date.weekday} · ${date.month} ${date.day}`
                    : `${date.month} ${date.day}`}
                  {statusText && (
                    <span className="font-bold" style={{ color: statusBg }}>
                      {" · "}
                      {statusText}
                    </span>
                  )}
                </span>
              </div>
              {/* Title — secondary now: lighter weight + size so the time
                  leads. Still line-clamp-2 to cap card height ~108px. */}
              <h3
                className="mt-1 text-[14px] font-semibold leading-snug tracking-tight line-clamp-2"
                style={{ color: "var(--app-ink)" }}
              >
                {event.title}
              </h3>
              {/* Venue line — small, calm, single-line truncate. */}
              {event.venue_name && (
                <p
                  className="mt-0.5 truncate text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {event.venue_name}
                </p>
              )}
              {/* Meta row — category · price · distance. Free + price
                  live in the SAME slot (mutually exclusive). Distance
                  right-aligns when present, so a vertical scan keeps
                  its visual rhythm even with mixed signals. */}
              <div className="mt-2 flex items-center gap-x-2 text-[11px]">
                <span
                  className="font-semibold uppercase tracking-[0.06em]"
                  style={{ color: accent }}
                >
                  {accentLabel}
                </span>
                {event.is_free ? (
                  <>
                    <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
                    <span style={{ color: "var(--app-positive)" }}>Free</span>
                  </>
                ) : event.price_text ? (
                  <>
                    <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
                    <span style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>
                  </>
                ) : null}
                {event.distance_m !== undefined && (
                  <span
                    className="ml-auto tabular-nums"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {formatDistance(event.distance_m)}
                  </span>
                )}
              </div>
            </div>
            {/* Trailing visual anchor.
                - WITH a real photo (the borrowed venue hero): a 64px
                  cover thumbnail.
                - WITHOUT one: a small CENTERED category icon on a tonal
                  tile (category accent at 14% over the sunken paper),
                  NOT the old full-bleed CategoryGraphic — which cropped
                  its watermark icon at 64px and read as a broken image
                  (the audit's flag). The icon + tint still carry the
                  category signal; the left accent rail already anchors
                  the row, so this stays quiet and clean. */}
            {event.hero_image ? (
              <div
                className="relative h-16 w-16 shrink-0 self-center overflow-hidden rounded-[10px] bg-[var(--app-bg-sunken)]"
                style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.08)" }}
              >
                <Image
                  src={event.hero_image}
                  alt=""
                  fill
                  sizes="64px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
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
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        {event.hero_image ? (
          <>
            <Image
              src={event.hero_image}
              alt=""
              fill
              sizes="64px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-1 px-1 pb-1 text-white">
              <span className="text-[10px] font-bold uppercase tracking-wide">{date.month}</span>
              <span className="font-serif text-[15px] font-semibold leading-none">{date.day}</span>
            </div>
          </>
        ) : (
          <div aria-hidden className="flex h-full w-full flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cat?.color ?? "var(--app-brand)" }}>
              {date.month}
            </span>
            <span className="font-serif text-xl font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
              {date.day}
            </span>
            <span className="mt-0.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
              {date.weekday}
            </span>
          </div>
        )}
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
          {date.time} · {event.venue_name}
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
            <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
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
