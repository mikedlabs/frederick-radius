import Link from "next/link";
import { rankPlaces, likelyOpenPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import PlaceCard from "@/components/place/PlaceCard";
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

  // Verified open in the slot first, then curated likely-open, so the
  // row is honest about which is which and is never a dead end.
  const open = rankPlaces({ origin, now, preferOpen: true, limit: 60 })
    .filter((p) => inSlot(p) && p.open_status.state === "open");
  const likely = likelyOpenPlaces(origin, now).filter(
    (p) => inSlot(p) && !open.some((o) => o.slug === p.slug),
  );

  const seen = new Set<string>();
  const picks = [...open, ...likely]
    .filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)))
    .slice(0, 6);

  return (
    <DismissibleSection
      id="right-now"
      title={slot.title}
      href="/map"
      cta="Explore"
      meta={picks.length > 0 ? "Open or likely open near you right now" : undefined}
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
        <ul className="space-y-2">
          {picks.map((p) => (
            <li key={p.slug}>
              <PlaceCard place={p} compact />
            </li>
          ))}
        </ul>
      )}
    </DismissibleSection>
  );
}
