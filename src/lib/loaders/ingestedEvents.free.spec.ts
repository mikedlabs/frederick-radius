import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/db/client", () => ({ getSql: () => null }));

import type { IngestedSeries } from "./ingested";
import { ingestedSeriesToCards } from "./ingestedEvents";

const NOW = new Date("2026-11-25T15:00:00.000Z");
const STARTS = "2026-11-28T15:00:00.000Z";

function series(overrides: Partial<IngestedSeries>): IngestedSeries {
  return {
    key: "series-1",
    title: "Family Storytime",
    venueName: "C. Burr Artz Public Library",
    address: "110 E Patrick St, Frederick, MD 21701",
    municipality: "frederick",
    sourceDomain: "frederick.librarycalendar.com",
    category: "family",
    lat: 39.4141,
    lng: -77.4089,
    description: "Stories, songs and rhymes for the whole family.",
    heroImage: null,
    heroImageAlt: null,
    occurrences: [
      {
        sourceUid: "occurrence-1",
        startsAtUtc: STARTS,
        endsAtUtc: "2026-11-28T15:30:00.000Z",
        allDay: false,
        sourceUrl: "https://frederick.librarycalendar.com/event/family-storytime-1",
        verifiedAt: "2026-11-25T10:00:00.000Z",
      },
    ],
    count: 1,
    nextStart: STARTS,
    isRecurring: false,
    ...overrides,
  };
}

function card(overrides: Partial<IngestedSeries> = {}) {
  const cards = ingestedSeriesToCards([series(overrides)], NOW);
  expect(cards).toHaveLength(1);
  return cards[0];
}

describe("admission on lifted library and fire company events", () => {
  it("marks a library program free so the Free filter keeps it", () => {
    expect(card()).toMatchObject({ source: "fcpl", is_free: true });
  });

  it("withholds the claim when a library row states a price, a fee or a ticket", () => {
    expect(card({ description: "Seats are $75 each." }).is_free).toBe(false);
    expect(
      card({ description: "A materials fee is collected at the door." }).is_free,
    ).toBe(false);
    expect(card({ title: "Author Talk (ticket required)" }).is_free).toBe(false);
    expect(card({ description: "The cost covers supplies." }).is_free).toBe(false);
    expect(card({ description: null }).is_free).toBe(true);
  });

  it("does not read a no-cost statement as a price", () => {
    // From the library feed read 2026-11-25: "Creek ReLeaf Reforestation Open
    // House" says the planting is at no cost to the property owner.
    expect(
      card({
        title: "Creek ReLeaf Reforestation Open House",
        description: "Trees are planted at no cost to the property owner.",
      }).is_free,
    ).toBe(true);
    expect(card({ description: "This program is offered at no cost." }).is_free).toBe(true);
    expect(card({ description: "Supplies are provided free of cost." }).is_free).toBe(true);
    expect(card({ description: "There is no cost to attend." }).is_free).toBe(true);
    // A stated price elsewhere in the same text still withholds the claim.
    expect(
      card({ description: "There is no cost to attend, but the kit fee is $10." }).is_free,
    ).toBe(false);
  });

  it("does not call a fire company event free", () => {
    expect(
      card({
        title: "Weekly Bingo",
        venueName: "Walkersville Volunteer Fire Company",
        address: "79 W Frederick St, Walkersville, MD 21793",
        municipality: "walkersville",
        sourceDomain: "fcvfra.com",
        category: "community",
        description: "Doors open at 5 PM.",
      }),
    ).toMatchObject({ source: "fcvfra", is_free: false });
  });
});
