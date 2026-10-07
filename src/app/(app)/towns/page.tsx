import type { Metadata } from "next";
import PageBloom from "@/components/ui/PageBloom";
import TownPicker from "@/components/town/TownPicker";
import CountyOverviewMap from "@/components/map/CountyOverviewMap";
import { townStats } from "@/lib/guided/town-stats";
import { getNextSevenDayPublicEventCountsByMunicipality } from "@/lib/guided/town-event-counts";
import { getMunicipalBoundaries } from "@/lib/integrations/fcGis";
import { EMPTY_LINE_FC } from "@/components/map/types";
import { townOverview } from "./townOverview";

export const metadata: Metadata = {
  title: "Towns",
  description: "Choose a Frederick County town to see its places and listed events in the next seven days.",
  alternates: { canonical: "/towns" },
};

export default async function TownsPage() {
  // Rolling seven-day PUBLIC event counts per town (curated + live county/
  // municipal feeds + venue lineups), cached. Passed into the pure townStats
  // so a feed-fed town no longer reads as though Radius has no listings.
  // The County's municipal boundaries revalidate weekly and fail soft to an
  // empty layer; the map then draws every town as a point, never a guess.
  const [eventCounts, boundaries] = await Promise.all([
    getNextSevenDayPublicEventCountsByMunicipality(),
    getMunicipalBoundaries().catch(() => EMPTY_LINE_FC),
  ]);
  const stats = townStats(eventCounts);
  const overview = townOverview(boundaries);

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Frederick County
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Pick a place to start.
        </h1>
      </header>

      {/* Visual first: the county with all of its towns leads the page. The
          map's town links are pointer shortcuts; the cards below are the
          full, keyboard-reachable list. */}
      <div className="mx-auto w-full max-w-md">
        <CountyOverviewMap
          label={`Map of Frederick County showing its ${overview.points.length} towns`}
          outline={overview.outline}
          areas={overview.areas}
          points={overview.points}
          tone="town"
          caption="Tap a town to see its places and events."
          sourceCredit={overview.areas.length > 0 ? "Town boundaries: Frederick County GIS" : undefined}
        />
      </div>

      <section aria-label="All towns" className="space-y-2.5">
        <p className="text-meta" style={{ color: "var(--app-ink-3)" }}>
          Event counts cover listings for the next 7 days.
        </p>
        <TownPicker stats={stats} locators={overview.locators} tileOutline={overview.tileOutline} />
      </section>
    </div>
  );
}
