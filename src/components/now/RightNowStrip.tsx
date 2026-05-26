import Link from "next/link";
import { Clock, Calendar, Sparkles, ArrowRight } from "lucide-react";
import { type PlaceCardData } from "@/lib/loaders/places";
import { eventsNext24h, type EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import {
  dayPartOf,
  easternDayKey,
  getOpenNowCandidates,
  getWeekendBetCandidates,
  tenMinBucket,
} from "@/lib/now-picks";

/**
 * RightNowStrip — three direct answers to the questions a stranger
 * actually opens the app to ask:
 *
 *   1. "Is anything good open near me right now?"   → openNowPlace
 *   2. "Is anything starting soon I should know about?" → startingSoonEvent
 *   3. "What about this weekend?"                    → weekendBetPlace
 *
 * Replaces the editorial "Worth your evening" picker as the
 * primary briefing-action block on /now. The previous design
 * stacked decorated rails ("Right now", "Local newsroom", "Did you
 * know") that all sort of pointed at content; this gives three
 * direct, time-bounded answers.
 *
 * Each card is a full-width tap target — name + one-line "why this"
 * + a single primary chip. No internal scroll, no horizontal rail.
 *
 * Pure server component. Computed at request time so the answers
 * reflect the actual now (open status, event proximity, weekend
 * calculation). If a card can't be resolved (no open places, no
 * events in the next day, no weekend pick), it's omitted entirely
 * — better to show two cards than to fake the third.
 */

/**
 * The expensive ranking work moved into src/lib/now-picks.ts behind
 * 'use cache' helpers. Those helpers return the filtered candidate
 * list keyed on a 10-minute bucket (open-now) or the day key (weekend
 * bet). The pick logic below reads cached candidates and applies the
 * daily rotation, which is cheap.
 */

/** Stable hash of a string to a 32-bit int. Used for deterministic
 *  daily rotation among top-N candidates. */
function seedHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable string handle for an origin LngLat. Rounded to ~110m so a
 *  slight GPS drift does not bust the candidate cache. */
function originKeyOf(o: LngLat): string {
  return `${o.lng.toFixed(3)}|${o.lat.toFixed(3)}`;
}

async function openNowPick(now: Date, origin: LngLat): Promise<PlaceCardData | null> {
  const candidates = await getOpenNowCandidates(
    dayPartOf(now),
    tenMinBucket(now),
    originKeyOf(origin),
  );
  const top = candidates.slice(0, 5);
  if (top.length === 0) return null;
  const seed = seedHash(easternDayKey(now) + ":open");
  return top[seed % top.length];
}

function startingSoonPick(now: Date): EventWithMeta | null {
  // Anything starting in the next 24 hours. eventsNext24h already
  // sorts by start time and excludes civic-meeting noise. Left at
  // request time: the events loader is fast and the result depends
  // on `now` at the minute level.
  const upcoming = eventsNext24h(now);
  return upcoming.find((e) => Boolean(e.hero_image)) ?? upcoming[0] ?? null;
}

async function weekendBetPick(now: Date, origin: LngLat): Promise<PlaceCardData | null> {
  const candidates = await getWeekendBetCandidates(
    easternDayKey(now),
    originKeyOf(origin),
  );
  const top = candidates.slice(0, 10);
  if (top.length === 0) return null;
  // Mix the day key with the slug to bias diversity. A venue that
  // happened to be top yesterday is unlikely to win today.
  const seed = seedHash(easternDayKey(now) + ":weekend");
  return top[seed % top.length];
}

function timeUntil(dateIso: string, now: Date): string {
  const ms = Date.parse(dateIso) - now.getTime();
  if (ms < 0) return "now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr}h`;
  const d = Math.round(hr / 24);
  return `in ${d}d`;
}

function openUntilLabel(p: PlaceCardData): string | null {
  // The decoratePlace pipeline doesn't always carry a closes_at; when
  // it does, surface it; otherwise fall back to a generic "Open now".
  const closes = (p as PlaceCardData & { closes_at?: string }).closes_at;
  if (!closes) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(closes));
  } catch {
    return null;
  }
}

export default async function RightNowStrip({
  now = new Date(),
  origin = FREDERICK_CENTER,
}: {
  now?: Date;
  origin?: LngLat;
}) {
  // Two of the three picks resolve to a cached candidate list and a
  // cheap rotation pick. The starting-soon event read stays at
  // request time. Resolved in parallel so the cached helpers warm in
  // parallel under PPR streaming.
  const [open, weekend] = await Promise.all([
    openNowPick(now, origin),
    weekendBetPick(now, origin),
  ]);
  const soon = startingSoonPick(now);

  // If every pick is empty (a brand new install with no data, or an
  // edge case), don't render an empty section at all — the /now spine
  // is allowed to be quiet.
  if (!open && !soon && !weekend) return null;

  return (
    <section aria-label="Right now" className="space-y-2">
      <h2
        className="eyebrow"
        style={{ color: "var(--app-ink-3)" }}
      >
        Right now
      </h2>
      <ul className="reveal-up space-y-2">
        {open && <li><OpenNowCard place={open} /></li>}
        {soon && <li><StartingSoonCard event={soon} now={now} /></li>}
        {weekend && <li><WeekendBetCard place={weekend} /></li>}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────
 * Sub-cards. Each is a single-line answer with a primary CTA
 * shape (icon stamp + title + one-line meta + arrow). They share
 * a layout but differ in color stamp + meta line so the user can
 * scan the three cards as "three different answers."
 * ───────────────────────────────────────────────────── */

function CardShell({
  href,
  stampColor,
  StampIcon,
  eyebrow,
  title,
  meta,
}: {
  href: string;
  stampColor: string;
  StampIcon: typeof Clock;
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="tactile tactile-interactive flex items-center gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 transition active:scale-[0.99]"
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <span
        aria-hidden
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${stampColor} 14%, transparent)`,
        }}
      >
        <StampIcon
          className="h-[18px] w-[18px]"
          strokeWidth={2}
          style={{ color: stampColor }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: stampColor }}
        >
          {eyebrow}
        </span>
        <span
          className="block truncate text-[15px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </span>
        <span
          className="block truncate text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {meta}
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0"
        strokeWidth={2.25}
        style={{ color: "var(--app-ink-3)" }}
      />
    </Link>
  );
}

function OpenNowCard({ place }: { place: PlaceCardData }) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const closes = openUntilLabel(place);
  // Build the meta line: distance + category + (close time). The
  // pieces below are what the user actually wants to know about an
  // "open right now" pick — how far, what kind, and how long they
  // have. Skip pieces that don't have data.
  const parts: string[] = [];
  if (typeof place.distance_m === "number") {
    const km = place.distance_m / 1000;
    parts.push(km < 1 ? `${Math.round(place.distance_m)}m` : `${km.toFixed(1)}km`);
  }
  if (cat?.name) parts.push(cat.name);
  if (closes) parts.push(`open until ${closes}`);
  return (
    <CardShell
      href={`/places/${place.slug}`}
      stampColor="var(--app-positive)"
      StampIcon={Clock}
      eyebrow="Open right now"
      title={place.name}
      meta={parts.join(" · ") || "Open"}
    />
  );
}

function StartingSoonCard({ event, now }: { event: EventWithMeta; now: Date }) {
  const when = timeUntil(event.starts_at, now);
  const venue = event.venue_name || event.municipality_name;
  return (
    <CardShell
      href={`/events/${event.slug}`}
      stampColor="var(--app-brand)"
      StampIcon={Calendar}
      eyebrow={`Starts ${when}`}
      title={event.title}
      meta={venue || "Frederick County"}
    />
  );
}

function WeekendBetCard({ place }: { place: PlaceCardData }) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const rating = place.google_rating ? `${place.google_rating.toFixed(1)}★` : null;
  const muniName = MUNICIPALITY_BY_SLUG[place.municipality]?.name;
  const parts: string[] = [];
  if (cat?.name) parts.push(cat.name);
  if (rating) parts.push(rating);
  if (muniName) parts.push(muniName);
  return (
    <CardShell
      href={`/places/${place.slug}`}
      stampColor="var(--app-accent)"
      StampIcon={Sparkles}
      eyebrow="Weekend bet"
      title={place.name}
      meta={parts.join(" · ") || "Editorial pick"}
    />
  );
}
