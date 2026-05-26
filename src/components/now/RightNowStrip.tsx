import Link from "next/link";
import { Clock, Calendar, Sparkles, ArrowRight } from "lucide-react";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { eventsNext24h, type EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";

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
 * Category sets tuned per daypart. The previous implementation used a
 * single "night-out" set for every card, which made the home page
 * hide parks/trails entirely and pick the same theater venue over
 * and over. Now the candidate set shifts with the time of day so
 * parks surface during daylight, restaurants surface around mealtimes,
 * and the museum/theater set holds the weekend bet.
 */
const DAYTIME_OUTDOOR_CATS = new Set([
  "park", "trail", "outdoors", "playground", "market",
]);
const DAYTIME_MIXED_CATS = new Set([
  "coffee", "bakery", "restaurant", "park", "trail", "museum", "gallery",
  "market", "outdoors",
]);
const EVENING_OUT_CATS = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "music", "theater", "gallery", "museum",
]);
const WEEKEND_BET_CATS = new Set([
  // A broader set than the old "night-out only" so a Saturday hike,
  // a Sunday farmers market, or a Friday brewery all qualify.
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "music", "theater", "gallery", "museum", "market",
  "park", "trail", "outdoors", "playground",
]);

/** Pick the right candidate set for the current Eastern-time hour.
 *  Returns the category set used for the "Open right now" card. */
function openNowCats(hour: number): Set<string> {
  if (hour < 10) return DAYTIME_MIXED_CATS;   // morning: coffee, bakery, parks
  if (hour < 16) return DAYTIME_OUTDOOR_CATS; // midday: parks, trails, markets
  return EVENING_OUT_CATS;                    // 4pm+: dinner / drinks / culture
}

/** Eastern hour 0–23 — same TZ discipline as elsewhere in the app. */
function easternHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(d),
    10,
  ) % 24;
}

/** YYYY-MM-DD in Eastern — used as a rotation seed so the weekend pick
 *  changes by day instead of being the same theater for a week. */
function easternDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Stable hash of a string → 32-bit int. Used for deterministic
 *  daily rotation among top-N candidates. */
function seedHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function openNowPick(now: Date, origin: LngLat): PlaceCardData | null {
  const ranked = rankPlaces({ origin, now, preferOpen: true, limit: 80 });
  const cats = openNowCats(easternHour(now));
  const candidates = ranked.filter(
    (p) =>
      p.open_status.state === "open" &&
      cats.has(p.category) &&
      (p.google_rating ?? 0) >= 4.0,
  );
  // Rotate among the top 5 daily so a user reloading mid-day doesn't
  // get the same coffee shop every time.
  const top = candidates.slice(0, 5);
  if (top.length === 0) return null;
  const seed = seedHash(easternDayKey(now) + ":open");
  return top[seed % top.length];
}

function startingSoonPick(now: Date): EventWithMeta | null {
  // Anything starting in the next 24 hours. eventsNext24h already
  // sorts by start time and excludes civic-meeting noise.
  const upcoming = eventsNext24h(now);
  return upcoming.find((e) => Boolean(e.hero_image)) ?? upcoming[0] ?? null;
}

function weekendBetPick(now: Date, origin: LngLat): PlaceCardData | null {
  // Broader candidate set (parks, trails, markets included) +
  // daily rotation. Was the source of the "same Endangered Species
  // Theatre Project every visit" issue.
  const ranked = rankPlaces({ origin, now, limit: 200 });
  const candidates = ranked.filter(
    (p) =>
      Boolean(p.google_photo_url) &&
      WEEKEND_BET_CATS.has(p.category) &&
      (p.google_rating ?? 0) >= 4.4 &&
      p.open_status.state !== "closed",
  );
  const top = candidates.slice(0, 10);
  if (top.length === 0) return null;
  // Mix the day key with the slug to bias diversity — a venue that
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

export default function RightNowStrip({
  now = new Date(),
  origin = FREDERICK_CENTER,
}: {
  now?: Date;
  origin?: LngLat;
}) {
  const open = openNowPick(now, origin);
  const soon = startingSoonPick(now);
  const weekend = weekendBetPick(now, origin);

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
