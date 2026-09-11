import type { Metadata } from "next";
import PageBloom from "@/components/ui/PageBloom";
import TownPicker from "@/components/town/TownPicker";
import { townStats } from "@/lib/guided/town-stats";
import { getNextSevenDayPublicEventCountsByMunicipality } from "@/lib/guided/town-event-counts";

export const metadata: Metadata = {
  title: "Towns",
  description: "Choose a Frederick County town to see its places and listed events in the next seven days.",
  alternates: { canonical: "/towns" },
};

export default async function TownsPage() {
  // Rolling seven-day PUBLIC event counts per town (curated + live county/
  // municipal feeds + venue lineups), cached. Passed into the pure townStats
  // so a feed-fed town no longer reads as though Radius has no listings.
  const eventCounts = await getNextSevenDayPublicEventCountsByMunicipality();
  const stats = townStats(eventCounts);
  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Frederick County
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Pick a place to start.
        </h1>
        <p className="text-[15px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Choose a town to see its places, listed events in the next seven days and what it&rsquo;s best for.
        </p>
      </header>

      <TownPicker stats={stats} />
    </div>
  );
}
