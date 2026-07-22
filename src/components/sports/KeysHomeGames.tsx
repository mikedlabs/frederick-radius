import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronRight } from "lucide-react";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import type { EventWithMeta } from "@/lib/loaders/events";
import { getVisibleEvents } from "@/lib/events/visible";
import { isKeysEvent, keysOpponent, keysTicketUrl } from "@/lib/today/keysEvent";
import { statusLabel } from "@/lib/event-status";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";

/**
 * KeysHomeGames — the next Frederick Keys home games on /sports, with a
 * per-game tickets link (the owner ask this page exists to answer).
 *
 * Data comes from THE unified event assembly (never a second query) — and
 * deliberately from the FULL `unified` set, not `publicEvents`: the public
 * lane drops postponed/cancelled rows, which would make a rained-out game
 * silently vanish from this list instead of showing its "Postponed" line.
 * Tickets go through keysTicketUrl (curated ticket_url, else the row's
 * Ticketmaster event page, else the box office — feed rows never carry
 * ticket_url, so a bare fallback would send every game to the box office).
 *
 * Deliberately app-token dressed: the Keys team palette is licensed to the
 * team CARDS (KeysScore, KeysCard), and this is page furniture, not a card.
 */

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

const KEYS_SCHEDULE_URL = "https://www.milb.com/frederick/schedule";
const MAX_GAMES = 3;

const GAME_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});
const GAME_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});
const GAME_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export default async function KeysHomeGames({
  eventsPromise,
  now,
}: {
  eventsPromise: EventsPromise;
  now: Date;
}) {
  const assembled = await eventsPromise.catch(() => null);
  const games = getVisibleEvents(
    (assembled?.unified ?? []).filter((e: EventWithMeta) => isKeysEvent(e)),
    now,
  ).slice(0, MAX_GAMES);

  if (games.length === 0) {
    // Honor the sourceHealth contract: a degraded assembly must not present
    // its partial set as a genuinely empty schedule.
    const degraded = assembled?.sourceHealth?.degraded ?? true;
    return (
      <div className="mt-4">
        <EmptyState
          icon={CalendarDays}
          title={
            degraded
              ? "The schedule feed is catching up."
              : "No upcoming home games are on the schedule right now."
          }
          body="The official site carries the full season."
          cta={{ label: "See the Keys schedule", href: KEYS_SCHEDULE_URL }}
        />
      </div>
    );
  }

  return (
    <div>
      <ol
        className="reveal-up mt-4 border-t"
        style={{ borderColor: "var(--app-border)" }}
      >
        {games.map((game) => {
          const starts = new Date(game.starts_at);
          const opponent = keysOpponent(game.title);
          const matchup = opponent ? `vs ${opponent}` : game.title;
          const statusText = statusLabel(game.status ?? "scheduled");
          const venue = game.venue_name || "Nymeo Field";
          const detail = statusText
            ? `${statusText}. Check the official schedule.`
            : `First pitch ${GAME_TIME.format(starts)} at ${venue}`;
          return (
            <li
              key={game.slug}
              className="relative grid min-h-[68px] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b py-3 sm:grid-cols-[84px_minmax(0,1fr)_auto]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span>
                <span
                  className="block font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  {GAME_WEEKDAY.format(starts)}
                </span>
                <span
                  className="mt-0.5 block font-mono text-[12px] font-semibold tabular-nums"
                  style={{ color: "var(--app-ink)" }}
                >
                  {GAME_DATE.format(starts)}
                </span>
              </span>
              <span className="min-w-0">
                <span
                  className="block truncate text-[14px] font-semibold leading-snug"
                  style={{ color: "var(--app-ink)" }}
                >
                  {matchup}
                </span>
                <span
                  className="mt-0.5 block truncate text-[11.5px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {detail}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {/* Tickets — per-game link via keysTicketUrl. Sits ABOVE the
                    stretched event link (z-2 vs z-1). */}
                <a
                  href={keysTicketUrl(game)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Get tickets for the ${GAME_WEEKDAY.format(starts)} ${GAME_DATE.format(starts)} game`}
                  className="tap-44 z-20 inline-flex items-center rounded-[var(--app-radius-sm)] border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{ borderColor: "var(--app-brand-press)", color: "var(--app-brand-press)" }}
                >
                  Get tickets
                </a>
                {/* The house row affordance: the chevron says the row itself
                    is tappable (it opens the event sheet). */}
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4"
                  style={{ color: "var(--app-ink-3)" }}
                />
              </span>
              {/* The row's primary surface — the event page (opens in the
                  event sheet inside the page's boundary). A stretched link so
                  no anchor nests inside another. */}
              <Link
                href={`/events/${game.slug}`}
                aria-label={`Frederick Keys ${matchup}, ${GAME_WEEKDAY.format(starts)} ${GAME_DATE.format(starts)}`}
                className="absolute inset-0 z-10"
              />
            </li>
          );
        })}
      </ol>
      <a
        href={KEYS_SCHEDULE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold"
        style={{ color: "var(--app-ink-2)" }}
      >
        See the full Keys schedule
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

/** Sketches the loaded shape — five flat divided schedule rows, not a card,
 *  so nothing morphs when the real list resolves. */
export function KeysHomeGamesFallback() {
  return (
    <div
      className="mt-4 border-t"
      style={{ borderColor: "var(--app-border)" }}
      aria-hidden
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[68px] items-center gap-3 border-b py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <Skeleton.Block height={34} width={64} round="var(--app-radius-sm)" />
          <div className="flex-1">
            <Skeleton.Block height={16} width="55%" round="var(--app-radius-sm)" />
          </div>
          <Skeleton.Block height={30} width={92} round="var(--app-radius-sm)" />
        </div>
      ))}
    </div>
  );
}
