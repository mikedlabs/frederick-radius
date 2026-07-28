import Link from "next/link";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import CategoryIcon from "@/components/place/CategoryIcon";
import IconStamp from "@/components/ui/IconStamp";
import type { EventWithMeta } from "@/lib/loaders/events";
// VALUE import from the DATA-FREE formatter module, never from the loader:
// a value import of loaders/events would drag its places-client static
// import (1.8MB JSON) into every client bundle that renders an event card.
import { eventDateBlock } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SaveButton from "@/components/saved/SaveButton";
import TrustChip from "@/components/ui/TrustChip";
import { Chip } from "@/components/ui/Chip";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventReasons } from "@/lib/event-reasons";
import { eventTrust } from "@/lib/trust";
import { formatDistance } from "@/lib/geo";
import { statusLabel } from "@/lib/event-status";
import DatePlate from "@/components/event/DatePlate";
import { eventAttendanceLabel } from "@/lib/events/attendance";
import type { EventCardVisual } from "@/components/event/eventVisuals";

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
}) {
  const featureImage = visual?.src ?? event.hero_image;
  // A photoless "feature" demotes to the glance row. The 3:2 glyph plate
  // read as a tall, mostly empty media block on a phone (beta trust audit
  // 2026-07-08), and the photo policy already says photoless leads keep the
  // calm glance row — enforced HERE at the card seam so every caller
  // (EventsExplorer leads, the /today hero) gets it without local gating.
  if (variant === "feature" && !featureImage) variant = "glance";

  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  // Lifecycle status — a cancelled or postponed event still shows
  // (a user looking for it needs to KNOW), but with a loud badge and
  // a struck-through title so it can never be mistaken for "on."
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  // Badge palette: red for cancelled, amber for postponed.
  // Text-safe status color. Plain --app-warning (amber) fails WCAG AA both as
  // inline text on cream and as white-on-fill badge; --app-warning-press is the
  // darkened AA-safe variant (white clears 4.5:1 on it, and it clears 4.5:1 as
  // text on cream). Cancelled already uses --app-danger, which passes. This one
  // value feeds every status spot below (inline text + white pills). (audit a11y)
  const statusBg = isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
  const venueLabel = eventAttendanceLabel(event);
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
  const accentText = `color-mix(in srgb, ${accent} 55%, var(--app-ink))`;
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
        className="group relative flex min-h-11 items-center gap-2.5 border-b px-1.5"
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
          <CategoryIcon slug={event.category} className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <Link
          href={`/events/${event.slug}`}
          prefetch={false}
          className={`flex min-h-11 min-w-0 self-stretch flex-1 items-center truncate text-[13px] outline-none focus-visible:underline ${
            isCancelled ? "line-through opacity-70" : ""
          }`}
          style={{ color: "var(--app-ink-2)" }}
        >
          <span className="absolute inset-0" aria-hidden />
          {event.title}
          {venueLabel && (
            <span style={{ color: "var(--app-ink-3)" }}> · {venueLabel}</span>
          )}
        </Link>
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {statusText && (
            <span className="font-semibold" style={{ color: statusBg }}>{statusText} · </span>
          )}
          {hideDate
            ? date.time
            : `${date.weekday} ${date.month} ${date.day}${date.time ? ` · ${date.time}` : ""}`}
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
            When the event is live right now it pulses on the positive
            green so "happening now" reads even in the dense listing. */}
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full${live ? " live-dot" : ""}`}
          style={{ background: live ? "var(--app-positive)" : accent }}
          title={live ? "Live now" : categoryLabel}
        />

        {/* Title + meta share one 44px link target. The old title-only anchor
            relied on an invisible absolute child to stretch the hit area,
            which worked with a pointer but remained a tiny focus target in
            accessibility and audit tooling. */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/events/${event.slug}`}
            prefetch={false}
            className={`flex min-h-11 min-w-0 flex-col justify-center outline-none after:absolute after:inset-0 focus-visible:underline ${
              isCancelled ? "line-through opacity-70" : ""
            }`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="block truncate text-[14px] font-semibold tracking-tight">
              {event.title}
            </span>
            <span
              className="block truncate text-[11px] font-normal leading-tight"
              style={{ color: "var(--app-ink-3)" }}
            >
              <span className="font-mono tabular-nums">{date.time}</span>
              {venueLabel && (
                <>
                  {" · "}
                  {venueLabel}
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

  // Feature variant — the editorial lead card for a horizon group, a
  // PHOTO-LED hero: a verified event or venue photograph fills a 3:2 face
  // with the title/when overlaid in white over a
  // legibility scrim. A photoless event never reaches this branch (the guard
  // above demotes it to glance), so the plate fallback below is defensive
  // only. This is the one above-fold image, so it carries priority;
  // everything else lazy-loads.
  if (variant === "feature") {
    const reasons = eventReasons(event);
    const onPhoto = Boolean(featureImage);
    const titleColor = onPhoto ? "#fff" : "var(--app-ink)";
    const subColor = onPhoto ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
    const eyebrowColor = onPhoto ? "color-mix(in srgb, " + accent + " 45%, #fff)" : accentText;
    const capColor = onPhoto ? "rgba(255,255,255,0.82)" : "var(--app-ink-2)";
    return (
      <article
        // 3:2 on mobile; a shorter 21:9 at lg so the feature card doesn't eat
        // ~590px of the desktop reading column and hide the results below it
        // (2026-07 shell-hardening P6). The overlaid title/eyebrow still clear
        // the shorter face, and the photo object-covers.
        className="tactile tactile-feature tactile-ring tactile-interactive group relative aspect-[3/2] w-full overflow-hidden rounded-[var(--app-radius-lg)] lg:aspect-[21/9]"
        style={{ backgroundColor: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
      >
        {/* The face — the venue photo, or a designed engraved-glyph plate. */}
        {onPhoto ? (
          <>
            <Image
              src={featureImage!}
              alt=""
              fill
              unoptimized={featureImage!.startsWith("/api/place-photo")}
              priority={priorityImage}
              sizes="(max-width: 640px) 100vw, 720px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="ken-burns object-cover"
            />
            <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.80) 2%, rgba(0,0,0,0.30) 40%, transparent 68%)" }} />
          </>
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center"
            style={{ background: `radial-gradient(120% 100% at 30% 18%, color-mix(in srgb, ${accent} 22%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid))`, color: accent }}
          >
            <CategoryIcon slug={event.category} className="h-24 w-24 opacity-50" />
          </span>
        )}
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: onPhoto ? 0.9 : 1 }} />

        {/* Top row — category eyebrow + live status + distance. */}
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-3.5">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: eyebrowColor, textShadow: onPhoto ? "0 1px 3px rgba(0,0,0,0.5)" : "none" }}>{categoryLabel}</span>
          {statusText && (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: statusBg }}>{statusText}</span>
          )}
          {visual?.caption ? (
            <span
              className="ml-auto max-w-[62%] truncate rounded-full bg-black/45 px-2 py-1 text-[9px] font-semibold tracking-[0.02em] text-white backdrop-blur-sm"
            >
              {visual.caption}
            </span>
          ) : event.distance_m !== undefined && (
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums" style={{ color: onPhoto ? "rgba(255,255,255,0.85)" : "var(--app-ink-3)", textShadow: onPhoto ? "0 1px 3px rgba(0,0,0,0.5)" : "none" }}>{formatDistance(event.distance_m)}</span>
          )}
        </div>

        {/* Bottom plate — title, when, "in their words", reasons. */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <Link
            href={`/events/${event.slug}`}
            prefetch={false}
            className={`flex min-h-11 items-end font-serif text-[21px] leading-[1.08] tracking-tight outline-none focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
            style={{ color: titleColor }}
          >
            <span className="absolute inset-0" aria-hidden />
            <span className="line-clamp-2">{event.title}</span>
          </Link>
          <p className="mt-1 truncate text-[13px]" style={{ color: subColor }}>
            {date.weekday && <span className="font-mono tabular-nums">{date.weekday} {date.month} {date.day}</span>}
            {date.time && <span className="font-mono tabular-nums">{" · "}{date.time}</span>}
            {venueLabel ? ` · ${venueLabel}` : ""}
            {visual?.caption && event.distance_m !== undefined
              ? ` · ${formatDistance(event.distance_m)}`
              : ""}
          </p>
          {whyItMatters && (
            <p className="mt-1 line-clamp-1 text-[12.5px] leading-snug" style={{ color: capColor }}>
              {whyItMatters}
            </p>
          )}
          {(reasons.length > 0 || event.is_free) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {event.is_free && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: onPhoto ? "rgba(255,255,255,0.92)" : "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}>Free</span>
              )}
              {!onPhoto && reasons.length > 0 && <ReasonChipRow reasons={reasons} />}
            </div>
          )}
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
    const tabBg = `color-mix(in srgb, ${accent} 68%, var(--app-ink))`;
    const reasons = eventReasons(event);
    return (
      <div className="relative flex h-full flex-col pt-[14px]">
        <span
          className="absolute left-3 top-0 z-10 max-w-[75%] truncate rounded-t-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ background: tabBg, boxShadow: "var(--app-edge)", color: "var(--app-on-brand)" }}
        >
          {live ? "Live now" : categoryLabel}
        </span>
        {/* Compact horizontal layout — date block beside the content, no empty
            header band, no bottom-pinned reasons. h-full/flex-1: in a flex
            rail the wrapper stretches to the tallest sibling anyway, so the
            card fills it — otherwise a two-line neighbor leaves this tile
            floating over a blank band. */}
        <article
          className="tactile tactile-interactive group relative flex flex-1 gap-3 overflow-hidden rounded-[var(--app-radius-lg)] rounded-tl-none border bg-[var(--app-bg-elevated)] px-3 pb-3 pt-2.5"
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
          <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent={accent} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {statusText && (
              <span className="self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: statusBg }}>{statusText}</span>
            )}
            <Link
              href={`/events/${event.slug}`}
              prefetch={false}
              className={`line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
              style={{ color: "var(--app-ink)" }}
            >
              <span className="absolute inset-0" aria-hidden />
              {event.title}
            </Link>
            <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-2)" }}>{date.time}</span>
              {venueLabel ? <> · {venueLabel}</> : null}
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
          // Faint left-edge accent in the category color so a stack of cards
          // reads as "different kinds of events" at a glance — COMPOSED WITH
          // the pressed-paper depth (edge + top highlight + soft elevation),
          // which a bare `inset 3px 0` used to clobber, leaving the card flat.
          boxShadow: `inset 3px 0 0 ${accent}, var(--app-edge), var(--app-hi), var(--app-elev-1)`,
        }}
      >
        <Link
          href={`/events/${event.slug}`}
          prefetch={false}
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
                {/* Recurrence legibility: a weekly bingo or storytime reads as a
                    repeating series, not a one-off. Derived from the real
                    collapsed cadence, never asserted. */}
                {event.is_recurring && event.recurrence_text && (
                  <span style={{ color: "var(--app-ink-3)" }}>· {event.recurrence_text}</span>
                )}
              </p>
              {/* Venue line — small, calm, single-line truncate. */}
              {venueLabel && (
                <p
                  className="mt-0.5 truncate text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {venueLabel}
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
                  unoptimized={event.hero_image.startsWith("/api/place-photo")}
                  sizes="48px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 rounded-[12px]" style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.10)" }} />
              </div>
            ) : (
              // The category glyph as a real pressed-paper SEAL — the canonical
              // IconStamp (tint over elevated paper, engraved glyph in the
              // accent, hairline edge + top highlight + warm accent lift),
              // replacing the hand-built tile so event cards match place/Saved.
              <IconStamp accent={accent} size="lg" className="shrink-0 self-center">
                <CategoryIcon slug={event.category} />
              </IconStamp>
            )}
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article className="tactile tactile-interactive group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-3">
      <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent={accent} />
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
            prefetch={false}
            className={`text-[15px] font-semibold tracking-tight outline-none focus-visible:underline line-clamp-2 ${isCancelled ? "line-through opacity-70" : ""}`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
          <span className="font-mono tabular-nums">{date.time}</span>{venueLabel ? ` · ${venueLabel}` : ""}
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
        <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
      </div>
    </article>
  );
}
