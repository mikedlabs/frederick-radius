import { NextResponse } from "next/server";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isLiveMusicEvent } from "@/lib/events/live-music";
import { eventIntentOf } from "@/lib/events/intents";
import { getLocalSportsGames } from "@/lib/integrations/local-sports";
import { buildIcsFeed, type IcsInput } from "@/lib/ics";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { SportsGame } from "@/lib/sports/types";

export const revalidate = 3600;

/**
 * GET /api/calendar/<feed>.ics — SUBSCRIBABLE county calendars.
 *
 * "Add to calendar" hands someone one event; this hands them the county.
 * Subscribed as webcal:// (Apple/Google/Outlook all speak it), the
 * calendar app re-fetches the feed on its own schedule (REFRESH-INTERVAL
 * PT6H), so tonight's additions and cancellations arrive without the
 * user ever reopening the app. Events come from THE unified assembly —
 * the same set /events renders, never a second query.
 *
 * Feeds:
 *   all.ics        — every public event in the next 30 days
 *   live-music.ics — live-music shows (same matcher /live-music uses)
 *   sports.ics     — local sports events plus official local-team schedules
 *
 * Honesty rules: only real dated events (unparseable starts dropped),
 * cancelled/postponed events EXCLUDED (a subscribed calendar deletes
 * what the feed drops — the calendar heals itself), capped at 300 rows
 * so a runaway feed can't melt someone's calendar app.
 */

const HORIZON_DAYS = 30;
const MAX_EVENTS = 300;
const ORIGIN = "https://frederickradius.app";

const FEEDS: Record<
  string,
  { name: string; match: (e: EventWithMeta) => boolean }
> = {
  all: { name: "Frederick County events · Frederick Radius", match: () => true },
  "live-music": {
    name: "Live music in Frederick County · Frederick Radius",
    match: (e) => isLiveMusicEvent(e),
  },
  sports: {
    name: "Frederick County sports · Frederick Radius",
    match: (e) => eventIntentOf(e) === "sports",
  },
};

function toIcsInput(e: EventWithMeta): IcsInput {
  const startMs = Date.parse(e.starts_at);
  const endMs = Date.parse(e.ends_at ?? "");
  return {
    uid: e.slug,
    title: e.title,
    starts_at: e.starts_at,
    // Feeds occasionally ship no usable end; a two-hour block is the same
    // default a human types into their calendar for an open-ended event.
    ends_at: Number.isFinite(endMs) && endMs > startMs ? e.ends_at : new Date(startMs + 2 * 3_600_000).toISOString(),
    description: e.description,
    venue_name: e.venue_name,
    address: e.address,
    url: `${ORIGIN}/events/${e.slug}`,
    all_day: e.is_all_day,
  };
}

export function localGameIcsInput(game: SportsGame): IcsInput {
  const start = Date.parse(game.startsAt);
  const homeAway =
    game.homeAway === "home"
      ? "Home game"
      : game.homeAway === "away"
        ? "Away game"
        : "Neutral-site game";
  const timing = game.timeTba ? " Time TBA." : "";
  return {
    uid: `local-sports-${game.id}`,
    title: `${game.teamName} ${game.homeAway === "away" ? "at" : "vs."} ${game.opponent}${game.timeTba ? " (Time TBA)" : ""}`,
    starts_at: game.startsAt,
    ends_at: new Date(start + 2 * 60 * 60 * 1000).toISOString(),
    description: `${game.sport}. ${homeAway}.${timing} Verified by ${game.teamName}'s official athletics calendar.`,
    venue_name: game.venue ?? undefined,
    address: game.location ?? undefined,
    url: `${ORIGIN}/sports`,
    all_day: game.timeTba,
  };
}

function localMatchKey(game: SportsGame): string {
  return [
    game.startsAt,
    ...[game.teamName, game.opponent]
      .map((value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
      .sort(),
  ].join("|");
}

export async function GET(_req: Request, { params }: { params: Promise<{ feed: string }> }) {
  const { feed } = await params;
  const key = feed.replace(/\.ics$/i, "");
  const def = FEEDS[key];
  if (!def) {
    return NextResponse.json({ error: "unknown_feed" }, { status: 404 });
  }

  const now = new Date();
  const horizonMs = now.getTime() + HORIZON_DAYS * 86_400_000;
  const { publicEvents } = await assembleUnifiedEvents(now);
  const rows = publicEvents
    .filter((e) => {
      const ms = Date.parse(e.starts_at);
      if (!Number.isFinite(ms) || ms > horizonMs) return false;
      if (e.status === "cancelled" || e.status === "postponed") return false;
      return def.match(e);
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, MAX_EVENTS);

  const inputs = rows.map(toIcsInput);
  if (key === "sports") {
    const seen = new Set<string>();
    const localGames = (await getLocalSportsGames(now))
      .filter((game) => {
        const ms = Date.parse(game.startsAt);
        if (!Number.isFinite(ms) || ms < now.getTime() || ms > horizonMs) {
          return false;
        }
        if (game.state === "cancelled" || game.state === "postponed") return false;
        const matchKey = localMatchKey(game);
        if (seen.has(matchKey)) return false;
        seen.add(matchKey);
        return true;
      })
      .map(localGameIcsInput);
    inputs.push(...localGames);
    inputs.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }

  const body = buildIcsFeed(def.name, inputs.slice(0, MAX_EVENTS));
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="frederick-radius-${key}.ics"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
