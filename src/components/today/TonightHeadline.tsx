import Link from "next/link";
import Image from "next/image";
import type { EventWithMeta } from "@/lib/loaders/events";
// Data-free formatter (never the loader) so this stays a light leaf.
import { eventDateBlock } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { isKeysEvent } from "@/lib/today/keysEvent";
import KeysCard from "@/components/today/KeysCard";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

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

  return (
    <section aria-label="The headliner" className="mt-6">
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
        <article className="group relative">
          {/* The headline — the event title itself in the display serif, page-
              title scale. The absolute-inset span makes the whole block (title,
              meta, photo) one tap target, the standard card pattern. */}
          <h2
            className="px-0.5 font-serif text-[27px] font-semibold leading-[1.06] tracking-tight [text-wrap:balance] sm:text-[32px]"
            style={{ color: "var(--app-ink)" }}
          >
            <Link
              href={`/events/${event.slug}`}
              prefetch={false}
              className="outline-none focus-visible:underline"
            >
              <span className="absolute inset-0" aria-hidden />
              {event.title}
            </Link>
          </h2>
          <p className="mt-1.5 px-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            <span
              className="font-mono font-semibold tabular-nums"
              style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
            >
              {live ? "On now" : date.time || `${date.weekday} ${date.month} ${date.day}`}
            </span>
            {where && <span style={{ color: "var(--app-ink-3)" }}> · {where}</span>}
            {event.is_free && <span style={{ color: "var(--app-positive)" }}> · Free</span>}
          </p>
          {/* The picture under the headline — the venue photo when the event
              carries one. A photoless headliner stays typographic; no plate,
              no placeholder art. */}
          {event.hero_image && (
            <div
              className="relative mt-3 aspect-[16/9] w-full overflow-hidden rounded-[var(--app-radius-lg)] sm:aspect-[21/9]"
              style={{ boxShadow: "var(--app-elev-1), var(--app-edge)" }}
            >
              <Image
                src={event.hero_image}
                alt=""
                fill
                unoptimized={event.hero_image.startsWith("/api/place-photo")}
                priority
                sizes="(max-width: 640px) 100vw, 720px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
              <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.9 }} />
            </div>
          )}
        </article>
      )}
    </section>
  );
}
