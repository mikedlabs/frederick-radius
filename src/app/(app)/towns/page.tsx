import type { Metadata } from "next";
import TownPicker from "@/components/town/TownPicker";
import { townStats } from "@/lib/guided/town-stats";
import { getNextSevenDayPublicEventCountsByMunicipality } from "@/lib/guided/town-event-counts";

export const metadata: Metadata = {
  title: "Towns",
  description: "Choose a Frederick County town to see its places and listed events in the next seven days.",
  alternates: { canonical: "/towns" },
};

export default async function TownsPage({ searchParams }: {
  searchParams: Promise<{ town?: string | string[] }>;
}) {
  // Rolling seven-day PUBLIC event counts per town (curated + live county/
  // municipal feeds + venue lineups), cached. Passed into the pure townStats
  // so a feed-fed town no longer reads as though Radius has no listings.
  const [query, eventCounts] = await Promise.all([searchParams, getNextSevenDayPublicEventCountsByMunicipality()]);
  const stats = townStats(eventCounts);
  const town = typeof query.town === "string" ? query.town : undefined;
  return (
    <div className="relative space-y-6">

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Frederick County
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Town guides
        </h1>
        <p className="text-[15px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Browse {stats.length} communities and their seven-day event listings.
        </p>
      </header>

      <TownPicker key={town} stats={stats} town={town} />
    </div>
  );
}
