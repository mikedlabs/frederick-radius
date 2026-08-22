import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
// Data-free formatter (never the loader) so this stays a light leaf.
import { eventDateBlock, formatEventWhen } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { isCarrollCreekEvent } from "@/lib/events/lead-rank";
import { eventSourceLabel } from "@/lib/events/source-label";
import { isKeysEvent } from "@/lib/today/keysEvent";
import KeysCard from "@/components/today/KeysCard";
import EventSourceLink from "@/components/event/EventSourceLink";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { eventCardVisual } from "@/components/event/eventVisuals";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import OfflineTodayCapture from "@/components/pwa/OfflineTodayCapture";
import { easternDayKey } from "@/lib/tz";
import { eventTown } from "@/lib/events/eventTown";
import { eventHasPreciseDisplayLocation } from "@/lib/events/geo-confidence";
import EventWalkTime from "@/components/today/EventWalkTime";

/**
 * TonightHeadline — the ONE headline of /today, rendered only when the day
 * actually has one (a real draw picked by splitTonightFeature; utility and
 * routine programming can never reach this component). Full-width, set like
 * a front-page lede: the event's own title in the large serif display face,
 * a mono when/where line under it, and the venue photo as the picture below
 * the headline. Typography carries the emphasis, not a bigger box — the
 * point of the one-hero pass is that on a night with a headliner the page
 * READS like it has a headline, and on a quiet night nothing fakes one
 * (the caller renders nothing; What's-on says the quiet truth instead).
 *
 * Keys home games keep their branded KeysCard treatment — the team plate IS
 * that event's headline dress, and a second serif title above it would say
 * the same thing twice.
 */

/** Eastern wall-clock hour (0-23) of an ISO instant — same daypart key the
 *  page's program grouping uses. */
function easternStartHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
      .format(new Date(iso)),
  );
}

function isGenericTownAddress(address: string): boolean {
  return /^(?:Frederick|Brunswick|Thurmont|Middletown|Emmitsburg|Walkersville|Mount Airy|New Market|Myersville|Woodsboro|Burkittsville|Urbana),?\s+MD(?:\s+\d{5})?$/i.test(
    address.trim(),
  );
}

export default function TonightHeadline({
  event,
  now,
  embedded = false,
}: {
  event: EventWithMeta;
  now: Date;
  /** Nested event-program treatment: tighter rhythm, h3 semantics, lazy art,
   *  and no offline-lead write because the place decision above owns it. */
  embedded?: boolean;
}) {
  const live = isEventLiveNow(event, now);
  const date = eventDateBlock(event);
  const when = formatEventWhen(event);
  const accent = CATEGORY_BY_SLUG[event.category]?.color ?? "#7A7975";
  const approvedVisual = eventCardVisual(event);
  const featureImage = approvedVisual?.src;
  const tonight = !event.is_all_day && easternStartHour(event.starts_at) >= 17;
  const onCarrollCreek = isCarrollCreekEvent(event);
  // The one editor's pick, and it SAYS so (the unlabeled hero was the first
  // "why is this big?" of the old section) — same wording the What's-on
  // feature used, so the label survives the move.
  const label = onCarrollCreek
    ? live
      ? "On Carroll Creek now"
      : tonight
        ? "On Carroll Creek tonight"
        : "On Carroll Creek today"
    : tonight
      ? "Tonight's pick"
      : "Today's pick";

  const venue = event.venue_name?.trim();
  // Same town label the program rows print (shared eventTown helper). This
  // component used to un-map "Downtown Frederick" back to "Frederick" via a
  // guard that no longer matched anything, so the headliner and the rows
  // below could name the same city two different ways on one screen.
  const town = eventTown(event);
  const address = event.address?.trim();
  const addressDetail =
    address && !isGenericTownAddress(address) ? address : null;
  const where = [
    venue,
    addressDetail ??
      (town && town.toLowerCase() !== venue?.toLowerCase() ? town : null),
  ]
    .filter(Boolean)
    .join(" · ");
  const admission = event.is_free
    ? "Free"
    : event.price_text?.trim() ||
      event.info?.admission?.trim() ||
      "Not listed by the event source";
  const description = event.description.trim();
  const sourceLabel = eventSourceLabel(event.source, event.organizer);
  const titleId = `today-headliner-${event.slug}-title`;
  const detailId = `today-headliner-${event.slug}-detail`;
  const Title = embedded ? "h3" : "h2";

  return (
    <section aria-label="The headliner" className={embedded ? "mt-3" : "mt-6"}>
      {!embedded ? (
        <OfflineTodayCapture
          snapshot={{
            dayKey: easternDayKey(now),
            lead: {
              kind: "event",
              title: event.title,
              detail: [live ? "On now when saved" : date.time, where].filter(Boolean).join(" · "),
              href: `/events/${event.slug}`,
            },
          }}
        />
      ) : null}
      <p
        className="mb-1.5 flex items-center gap-1.5 px-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--app-brand-press)" }}
      >
        {live && (
          <span aria-hidden className="live-dot h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
        )}
        {label}
      </p>
      {isKeysEvent(event) ? (
        <KeysCard event={event} variant="feature" />
      ) : (
        <article className="min-w-0">
          <Link
            href={`/events/${event.slug}`}
            prefetch={false}
            aria-labelledby={titleId}
            aria-describedby={detailId}
            className={`group block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--app-bg)] ${
              featureImage ? "" : "border-y py-4"
            }`}
            style={featureImage ? undefined : { borderColor: "var(--app-border)" }}
          >
            {/* This is Today’s one opt-in editorial face. It stays fluid and
                untruncated so a real event name still reads cleanly at 320px. */}
            <Title
              id={titleId}
              className="min-w-0 break-words px-0.5 font-editorial text-[clamp(1.875rem,9vw,2.75rem)] leading-[0.98] tracking-[-0.025em] [text-wrap:balance]"
              style={{ color: "var(--app-ink)" }}
            >
              {event.title}
            </Title>
            <div
              id={detailId}
              className="mt-2 space-y-1 px-0.5 text-[13px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              <p>
                {live ? (
                  <span
                    className="font-mono font-semibold tabular-nums"
                    style={{ color: "var(--app-brand-press)" }}
                  >
                    On now
                  </span>
                ) : null}
                <span
                  className="font-mono font-semibold tabular-nums"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {live ? ` · ${when}` : when}
                </span>
              </p>
              {where ? (
                <p style={{ color: "var(--app-ink-3)" }}>{where}</p>
              ) : null}
              <p>
                <span className="font-semibold" style={{ color: "var(--app-ink-3)" }}>
                  Admission
                </span>
                <span
                  style={{
                    color: event.is_free
                      ? "var(--app-cool)"
                      : "var(--app-ink-2)",
                  }}
                >
                  {` · ${admission}`}
                </span>
              </p>
            </div>
            {description ? (
              <p
                className="mt-3 max-w-[68ch] px-0.5 text-[14px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {description}
              </p>
            ) : null}
            {eventHasPreciseDisplayLocation(event) ? (
              <EventWalkTime dest={event.geom} />
            ) : null}
            {/* Source-aware venue visuals are labeled as the place they depict,
                so a Carroll Creek photograph never pretends to document this
                specific event. */}
            {featureImage ? (
              <figure
                className="relative mt-3 aspect-[16/9] w-full overflow-hidden rounded-[var(--app-radius-lg)] sm:aspect-[21/9]"
                style={{ boxShadow: "var(--app-elev-1), var(--app-edge)" }}
              >
                <Image
                  src={featureImage}
                  alt=""
                  fill
                  priority={!embedded}
                  unoptimized={featureImage.startsWith("/api/place-photo")}
                  sizes="(max-width: 640px) 100vw, 720px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.015]"
                />
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.9 }} />
              </figure>
            ) : null}
          </Link>
          {approvedVisual ? (
            <EventVisualCredit
              visual={approvedVisual}
              className="mt-1.5 px-0.5"
            />
          ) : null}
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[12px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Link
              href={`/events/${event.slug}`}
              prefetch={false}
              className="tap-44-y inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Full event details
              <ArrowRight
                aria-hidden
                className="h-3.5 w-3.5"
                strokeWidth={2.1}
              />
            </Link>
            <span>Source · {sourceLabel}</span>
            {event.source_url ? (
              <EventSourceLink href={event.source_url} />
            ) : null}
          </div>
        </article>
      )}
    </section>
  );
}
