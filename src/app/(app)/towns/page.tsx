import type { Metadata } from "next";
import PageBloom from "@/components/ui/PageBloom";
import TownPicker from "@/components/town/TownPicker";
import { townStats } from "@/lib/guided/town-stats";
import { getWeeklyPublicEventCountsByMunicipality } from "@/lib/guided/town-event-counts";

export const metadata: Metadata = {
  title: "Explore towns",
  description: "Pick a Frederick County town to start — real place counts and what's on this week.",
  alternates: { canonical: "/towns" },
};

export default async function TownsPage() {
  // Real this-week PUBLIC event counts per town (curated + live county/
  // municipal feeds + venue lineups), cached. Passed into the pure townStats
  // so a feed-fed town no longer reads "No events this week."
  const eventCounts = await getWeeklyPublicEventCountsByMunicipality();
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
          The county&rsquo;s twelve municipalities, plus Urbana. Each card is a real
          starting point — how much is worth your time there, and what&rsquo;s on this week.
        </p>
      </header>

      <TownPicker stats={stats} />
    </div>
  );
}
