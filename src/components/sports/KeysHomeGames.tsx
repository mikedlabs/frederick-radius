import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import type { EventWithMeta } from "@/lib/loaders/events";
import { getVisibleEvents } from "@/lib/events/visible";
import { isKeysEvent, keysOpponent } from "@/lib/today/keysEvent";
import { statusLabel } from "@/lib/event-status";
import Skeleton from "@/components/ui/Skeleton";

/**
 * KeysHomeGames — the next Frederick Keys home games on /sports, with a
 * per-game tickets link (the owner ask this page exists to answer).
 *
 * Data comes from THE unified event assembly (never a second query): the
 * schedule feed lists home games only, and the Keys/Ticketmaster dedupe in
 * unifiedEvents keeps the richer Ticketmaster row when one exists, so
 * `ticket_url` is per-game when Ticketmaster lists the game and the official
 * box office covers the rest. Away games live in the live score card above
 * this list, not here — hence "home games" in the heading.
 *
 * Deliberately app-token dressed: the Keys team palette is licensed to the
 * team CARDS (KeysScore, KeysCard), and this is page furniture, not a card.
 */

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

const KEYS_TICKETS_URL = "https://www.milb.com/frederick/tickets";
const KEYS_SCHEDULE_URL = "https://www.milb.com/frederick/schedule";
const MAX_GAMES = 5;

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
    (assembled?.publicEvents ?? []).filter((e: EventWithMeta) => isKeysEvent(e)),
    now,
  ).slice(0, MAX_GAMES);

  if (games.length === 0) {
    return (
      <p
        className="mt-4 border-y py-6 text-[12.5px] leading-relaxed"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
      >
        No upcoming home games are on the schedule feed right now. The official
        site carries the full season.{" "}
        <a
          href={KEYS_SCHEDULE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2"
          style={{ color: "var(--app-ink)" }}
        >
          See the Keys schedule
        </a>
      </p>
    );
  }

  return (
    <div>
      <ol className="reveal-up mt-4 divide-y divide-black/10 border-y border-black/12">
        {games.map((game) => {
          const starts = new Date(game.starts_at);
          const opponent = keysOpponent(game.title);
          const matchup = opponent ? `vs ${opponent}` : game.title;
          const statusText = statusLabel(game.status ?? "scheduled");
          const detail = statusText
            ? `${statusText}. Check the official schedule.`
            : `First pitch ${GAME_TIME.format(starts)} at Nymeo Field`;
          return (
            <li
              key={game.slug}
              className="relative grid min-h-[68px] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[84px_minmax(0,1fr)_auto]"
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
              {/* Tickets — the per-game Ticketmaster link when the merged feed
                  row carries one, else the official box office. Sits ABOVE the
                  stretched event link (z-2 vs z-1). */}
              <a
                href={game.ticket_url || KEYS_TICKETS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Get tickets for the ${GAME_WEEKDAY.format(starts)} ${GAME_DATE.format(starts)} game`}
                className="tap-44 z-[2] inline-flex shrink-0 items-center rounded-[var(--app-radius-sm)] border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ borderColor: "var(--app-brand-press)", color: "var(--app-brand-press)" }}
              >
                Get tickets
              </a>
              {/* The row's primary surface — the event page (opens in the
                  event sheet inside the page's boundary). A stretched link so
                  no anchor nests inside another. */}
              <Link
                href={`/events/${game.slug}`}
                aria-label={`Frederick Keys ${matchup}, ${GAME_WEEKDAY.format(starts)} ${GAME_DATE.format(starts)}`}
                className="absolute inset-0 z-[1]"
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

export function KeysHomeGamesFallback() {
  return (
    <div className="mt-4">
      <Skeleton.Block height={200} round="var(--app-radius-lg)" />
    </div>
  );
}
