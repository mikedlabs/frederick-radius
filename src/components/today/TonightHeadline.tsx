import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
// Data-free formatter (never the loader) so this stays a light leaf.
import { eventDateBlock } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { isKeysEvent } from "@/lib/today/keysEvent";
import KeysCard from "@/components/today/KeysCard";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { eventCardVisual } from "@/components/event/eventVisuals";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import OfflineTodayCapture from "@/components/pwa/OfflineTodayCapture";
import { easternDayKey } from "@/lib/tz";

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

export default function TonightHeadline({ event, now }: { event: EventWithMeta; now: Date }) {
  const live = isEventLiveNow(event, now);
  const date = eventDateBlock(event);
  const accent = CATEGORY_BY_SLUG[event.category]?.color ?? "#7A7975";
  const approvedVisual = eventCardVisual(event);
  const featureImage = approvedVisual?.src;
  const tonight = !event.is_all_day && easternStartHour(event.starts_at) >= 17;
  // The one editor's pick, and it SAYS so (the unlabeled hero was the first
  // "why is this big?" of the old section) — same wording the What's-on
  // feature used, so the label survives the move.
  const label = tonight ? "Tonight's pick" : "Today's pick";

  const venue = event.venue_name?.trim();
  // "Frederick · Frederick": some feeds stamp the town as the venue name, and
  // "Downtown Frederick" overclaims for many City-of-Frederick venues — the
  // same two calls the program rows make.
  const rawTown = event.municipality_name?.trim();
  const town = rawTown === "Downtown Frederick" ? "Frederick" : rawTown;
  const where = [venue, town && town.toLowerCase() !== venue?.toLowerCase() ? town : null]
    .filter(Boolean)
    .join(" · ");
  const titleId = `today-headliner-${event.slug}-title`;
  const detailId = `today-headliner-${event.slug}-detail`;

  return (
    <section aria-label="The headliner" className="mt-6">
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
            <h2
              id={titleId}
              className="min-w-0 break-words px-0.5 font-editorial text-[clamp(1.875rem,9vw,2.75rem)] leading-[0.98] tracking-[-0.025em] [text-wrap:balance]"
              style={{ color: "var(--app-ink)" }}
            >
              {event.title}
            </h2>
            <p
              id={detailId}
              className="mt-2 px-0.5 text-[13px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              <span
                className="font-mono font-semibold tabular-nums"
                style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
              >
                {live ? "On now" : date.time || `${date.weekday} ${date.month} ${date.day}`}
              </span>
              {where && <span style={{ color: "var(--app-ink-3)" }}> · {where}</span>}
              {event.is_free && <span style={{ color: "var(--app-cool)" }}> · Free</span>}
            </p>
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
                  priority
                  unoptimized={featureImage.startsWith("/api/place-photo")}
                  sizes="(max-width: 640px) 100vw, 720px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.015]"
                />
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.9 }} />
              </figure>
            ) : (
              <span
                className="mt-3 inline-flex items-center gap-1.5 px-0.5 text-[12px] font-semibold"
                style={{ color: "var(--app-brand-press)" }}
              >
                View event
                <ArrowRight
                  aria-hidden
                  className="h-3.5 w-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
                  strokeWidth={2.1}
                />
              </span>
            )}
          </Link>
          {approvedVisual ? (
            <EventVisualCredit
              visual={approvedVisual}
              className="mt-1.5 px-0.5"
            />
          ) : null}
        </article>
      )}
    </section>
  );
}
