import { describe, expect, it } from "vitest";
import { dedupeCrossSourceShows } from "./normalize";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * Real public-feed rows from the 2026-10-08 live audit (Oct 8–18 ET).
 * Production browse still listed each pair separately because
 * dedupeCrossSourceShows refused comma+code library rooms and street-address
 * twins.
 */
function mk(over: Partial<EventWithMeta>): EventWithMeta {
  return {
    slug: "e",
    title: "Event",
    starts_at: "2026-10-09T00:00:00.000Z",
    venue_name: "",
    municipality: "frederick",
    geom: { lng: -77.41, lat: 39.41 },
    geo_confidence: "area",
    ...over,
  } as unknown as EventWithMeta;
}

describe("dedupeCrossSourceShows — 2026-10-08 live audit fixtures", () => {
  it("merges The Hot Sardines Friday Oct 9 8 PM (named hall vs street)", () => {
    const weinberg = mk({
      slug: "the-hot-sardines-weinberg",
      title: "The Hot Sardines",
      venue_name: "Weinberg Center for the Arts",
      starts_at: "2026-10-09T20:00:00-04:00",
      municipality: "frederick",
      source: "venue-extract",
    });
    const street = mk({
      slug: "the-hot-sardines-street",
      title: "The Hot Sardines",
      venue_name: "20 W Patrick Street",
      starts_at: "2026-10-09T20:00:00-04:00",
      municipality: "frederick",
      source: "ticketmaster",
    });
    const out = dedupeCrossSourceShows([weinberg, street]);
    expect(out).toHaveLength(1);
    expect(out[0].venue_name).toBe("Weinberg Center for the Arts");
  });

  it("merges Curious Iguana author talks Oct 14 and Oct 15 6 PM (dfp vs fcpl)", () => {
    const almaFcpl = mk({
      slug: "curious-iguana-presents-alma-katsu-fcpl-20261014",
      title: "Curious Iguana presents: Alma Katsu",
      venue_name: "C. Burr Artz Public Library, Community Room (CBA)",
      starts_at: "2026-10-14T22:00:00.000Z",
      source: "fcpl",
    });
    const almaDfp = mk({
      slug: "curious-iguana-presents-thriller-author-alma-katsu-2026-10-14",
      title: "Curious Iguana Presents: Thriller Author Alma Katsu",
      venue_name: "C. Burr Artz Public Library",
      starts_at: "2026-10-14T22:00:00.000Z",
      source: "dfp",
    });
    const buckleyDfp = mk({
      slug: "curious-iguana-presents-bestselling-author-michael-buckley-2026-10-15",
      title: "Curious Iguana Presents: Bestselling Author Michael Buckley",
      venue_name: "C. Burr Artz Public Library",
      starts_at: "2026-10-15T22:00:00.000Z",
      source: "dfp",
    });
    const buckleyFcpl = mk({
      slug: "curious-iguana-presents-michael-buckley-fcpl-20261015",
      title: "Curious Iguana presents: Michael Buckley",
      venue_name: "C. Burr Artz Public Library, Community Room (CBA)",
      starts_at: "2026-10-15T22:00:00.000Z",
      source: "fcpl",
    });

    expect(dedupeCrossSourceShows([almaFcpl, almaDfp])).toHaveLength(1);
    expect(dedupeCrossSourceShows([buckleyDfp, buckleyFcpl])).toHaveLength(1);
    expect(
      dedupeCrossSourceShows([almaFcpl, almaDfp, buckleyDfp, buckleyFcpl]),
    ).toHaveLength(2);
  });

  it("merges Family Fun: Connect with Coipp Oct 11 2 PM (fcpl room+code vs dfp)", () => {
    const fcpl = mk({
      slug: "family-fun-connect-with-coipp-fcpl-20261011",
      title: "Family Fun: Connect with Coipp",
      venue_name: "C. Burr Artz Public Library, Programming Room (CBA)",
      starts_at: "2026-10-11T18:00:00.000Z",
      source: "fcpl",
    });
    const dfp = mk({
      slug: "family-fun-connect-with-coipp-2026-10-11",
      title: "Family Fun: Connect with Coipp",
      venue_name: "C. Burr Artz Public Library",
      starts_at: "2026-10-11T18:00:00.000Z",
      source: "dfp",
    });
    expect(dedupeCrossSourceShows([fcpl, dfp])).toHaveLength(1);
  });

  it("merges Touch-a-Fire-Truck Oct 9 (county street vs Walkersville library)", () => {
    const county = mk({
      slug: "touch-a-fire-truck-county",
      title: "Touch-a-Fire-Truck",
      venue_name: "2 S Glade Road",
      starts_at: "2026-10-09T14:00:00-04:00",
      municipality: "walkersville",
      source: "county",
    });
    const fcpl = mk({
      slug: "touch-a-fire-truck-fcpl",
      title: "Touch-a-Fire-Truck",
      venue_name: "Walkersville Branch Library",
      starts_at: "2026-10-09T14:00:00-04:00",
      municipality: "walkersville",
      source: "fcpl",
    });
    expect(dedupeCrossSourceShows([county, fcpl])).toHaveLength(1);
  });

  it("keeps different-titled same-time library programs in different rooms", () => {
    const swap = mk({
      slug: "halloween-costume-swap-fcpl-20261011",
      title: "Halloween Costume Swap",
      venue_name: "Middletown Branch Library, Family Play Area",
      starts_at: "2026-10-11T17:00:00.000Z",
      municipality: "middletown",
      source: "fcpl",
    });
    const haunting = mk({
      slug: "a-haunting-in-the-library-fcpl-20261011",
      title: "A Haunting in the Library: A Spooky Adult Event",
      venue_name: "Middletown Branch Library, Inside Library (MID)",
      starts_at: "2026-10-11T17:00:00.000Z",
      municipality: "middletown",
      source: "fcpl",
    });
    expect(dedupeCrossSourceShows([swap, haunting])).toHaveLength(2);
  });

  it("reports the audit fixture before/after count", () => {
    const pairs = [
      [
        mk({
          slug: "sardines-a",
          title: "The Hot Sardines",
          venue_name: "Weinberg Center for the Arts",
          starts_at: "2026-10-09T20:00:00-04:00",
        }),
        mk({
          slug: "sardines-b",
          title: "The Hot Sardines",
          venue_name: "20 W Patrick Street",
          starts_at: "2026-10-09T20:00:00-04:00",
        }),
      ],
      [
        mk({
          slug: "alma-a",
          title: "Curious Iguana presents: Alma Katsu",
          venue_name: "C. Burr Artz Public Library, Community Room (CBA)",
          starts_at: "2026-10-14T22:00:00.000Z",
        }),
        mk({
          slug: "alma-b",
          title: "Curious Iguana Presents: Thriller Author Alma Katsu",
          venue_name: "C. Burr Artz Public Library",
          starts_at: "2026-10-14T22:00:00.000Z",
        }),
      ],
      [
        mk({
          slug: "buckley-a",
          title: "Curious Iguana presents: Michael Buckley",
          venue_name: "C. Burr Artz Public Library, Community Room (CBA)",
          starts_at: "2026-10-15T22:00:00.000Z",
        }),
        mk({
          slug: "buckley-b",
          title: "Curious Iguana Presents: Bestselling Author Michael Buckley",
          venue_name: "C. Burr Artz Public Library",
          starts_at: "2026-10-15T22:00:00.000Z",
        }),
      ],
      [
        mk({
          slug: "coipp-a",
          title: "Family Fun: Connect with Coipp",
          venue_name: "C. Burr Artz Public Library, Programming Room (CBA)",
          starts_at: "2026-10-11T18:00:00.000Z",
        }),
        mk({
          slug: "coipp-b",
          title: "Family Fun: Connect with Coipp",
          venue_name: "C. Burr Artz Public Library",
          starts_at: "2026-10-11T18:00:00.000Z",
        }),
      ],
      [
        mk({
          slug: "truck-a",
          title: "Touch-a-Fire-Truck",
          venue_name: "2 S Glade Road",
          starts_at: "2026-10-09T14:00:00-04:00",
          municipality: "walkersville",
        }),
        mk({
          slug: "truck-b",
          title: "Touch-a-Fire-Truck",
          venue_name: "Walkersville Branch Library",
          starts_at: "2026-10-09T14:00:00-04:00",
          municipality: "walkersville",
        }),
      ],
    ];
    const negative = [
      mk({
        slug: "swap",
        title: "Halloween Costume Swap",
        venue_name: "Middletown Branch Library, Family Play Area",
        starts_at: "2026-10-11T17:00:00.000Z",
        municipality: "middletown",
      }),
      mk({
        slug: "haunt",
        title: "A Haunting in the Library: A Spooky Adult Event",
        venue_name: "Middletown Branch Library, Inside Library (MID)",
        starts_at: "2026-10-11T17:00:00.000Z",
        municipality: "middletown",
      }),
    ];
    const rows = [...pairs.flat(), ...negative];
    const out = dedupeCrossSourceShows(rows);
    expect(rows).toHaveLength(12);
    expect(out).toHaveLength(7);
  });
});
