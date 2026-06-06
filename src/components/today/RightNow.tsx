import Link from "next/link";
import { rankPlaces, likelyOpenPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { isRecommendable } from "@/lib/relevance";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import RightNowGrid from "./RightNowGrid";
import DismissibleSection from "./DismissibleSection";

/**
 * Time-aware discovery. In the morning it leans to coffee and bakeries,
 * midday to lunch and browsing, evening to dinner and drinks. It only
 * shows places that are open or likely open right now, so it never
 * sends someone to a locked door, and it never invents a place.
 */

type Slot = { id: string; title: string; cats: string[] };

function slotFor(now: Date): Slot {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (h >= 4 && h < 11) return { id: "morning", title: "Start your morning", cats: ["coffee", "bakery"] };
  if (h >= 11 && h < 16) return { id: "midday", title: "Good for right now", cats: ["restaurant", "market", "museum", "coffee"] };
  if (h >= 16 && h < 22) return { id: "evening", title: "Out tonight", cats: ["restaurant", "bar", "brewery", "theater", "music"] };
  return { id: "late", title: "Still open late", cats: ["bar", "brewery", "restaurant"] };
}

export default function RightNow({
  origin = FREDERICK_CENTER,
  now,
}: {
  origin?: LngLat;
  now: Date;
}) {
  const slot = slotFor(now);
  const inSlot = (p: PlaceCardData) => slot.cats.includes(p.category);

  // County-wide (not downtown-anchored): a big open/likely-open pool in
  // the slot, then spread across municipalities and rotated by day so
  // it is genuinely *different places* each visit, never the same six
  // Frederick spots. Honest: verified-open first, curated likely-open
  // fills, nothing closed is shown.
  const openVerified = rankPlaces({ origin, now, preferOpen: true, limit: 500 })
    .filter((p) => inSlot(p) && p.open_status.state === "open");
  const likely = likelyOpenPlaces(origin, now).filter(
    (p) => inSlot(p) && !openVerified.some((o) => o.slug === p.slug),
  );
  const seen = new Set<string>();
  const uniq = [...openVerified, ...likely].filter((p) => {
    // Recommendation surface → editorial eligibility (no schools/daycares
    // leading "right now"), then de-dupe across the two sources.
    if (!isRecommendable(p)) return false;
    return seen.has(p.slug) ? false : (seen.add(p.slug), true);
  });

  const dayIdx = Math.floor(now.getTime() / 86_400_000);
  const byMuni = new Map<string, PlaceCardData[]>();
  for (const p of uniq) {
    const a = byMuni.get(p.municipality);
    if (a) a.push(p);
    else byMuni.set(p.municipality, [p]);
  }
  // Rotate each town's list + the town order by day → fresh picks daily.
  for (const arr of byMuni.values()) {
    if (arr.length > 1) arr.unshift(...arr.splice(dayIdx % arr.length));
  }
  const munis = [...byMuni.keys()];
  const start = munis.length ? dayIdx % munis.length : 0;
  const order = [...munis.slice(start), ...munis.slice(0, start)];
  // Round-robin one per town across the county until we have 8.
  const picks: PlaceCardData[] = [];
  const cursor: Record<string, number> = {};
  let progressed = true;
  while (picks.length < 8 && progressed) {
    progressed = false;
    for (const m of order) {
      const arr = byMuni.get(m)!;
      const c = cursor[m] ?? 0;
      if (c < arr.length) {
        picks.push(arr[c]);
        cursor[m] = c + 1;
        progressed = true;
        if (picks.length >= 8) break;
      }
    }
  }

  return (
    <DismissibleSection
      id="right-now"
      title={slot.title}
      href="/map"
      cta="See all"
      meta={picks.length > 0 ? "Open or likely open across the county right now" : undefined}
    >
      {picks.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Quiet hours. Most spots are closed.{" "}
          <Link href="/map" className="font-medium" style={{ color: "var(--app-brand)" }}>
            Browse the map
          </Link>
          .
        </p>
      ) : (
        // Client-side reorder by interests (Phase D personalization).
        // The set of picks is identical to what the server chose; only
        // the order shifts so the user's interest-matched places lead.
        <RightNowGrid picks={picks} />
      )}
    </DismissibleSection>
  );
}
