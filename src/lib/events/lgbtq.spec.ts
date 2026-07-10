import { describe, expect, it } from "vitest";
import { isLgbtqEvent, isLgbtqTitle } from "./lgbtq";

describe("isLgbtqTitle", () => {
  it("matches unambiguous community terms at word boundaries", () => {
    expect(isLgbtqTitle("LGBTQ+ Youth Group")).toBe(true);
    expect(isLgbtqTitle("LGBTQIA2S+ community mixer")).toBe(true);
    expect(isLgbtqTitle("Queer Craft Night")).toBe(true);
    expect(isLgbtqTitle("Queeraoke with Black-Eyed Suzy")).toBe(true);
    expect(isLgbtqTitle("Sapphic Summer Dance")).toBe(true);
    expect(isLgbtqTitle("PFLAG Ice Cream Social")).toBe(true);
    expect(isLgbtqTitle("Transgender Day of Remembrance vigil")).toBe(true);
    expect(isLgbtqTitle("Gay men's book club")).toBe(true);
  });

  it("matches Pride only in event contexts or named Pride events", () => {
    expect(isLgbtqTitle("Frederick Pride 2027")).toBe(true);
    expect(isLgbtqTitle("Pride Month Kickoff")).toBe(true);
    expect(isLgbtqTitle("Pride Night at the ballpark")).toBe(true);
    expect(isLgbtqTitle("Pride Brunch Crawl")).toBe(true);
    // "Pride" as an ordinary English word stays out.
    expect(isLgbtqTitle("Pride of Baltimore II deck tours")).toBe(false);
    expect(isLgbtqTitle("Lions pride fundraiser dinner")).toBe(false);
  });

  it("matches drag as performance, never motorsports", () => {
    expect(isLgbtqTitle("Beach, Please! Drag Bingo")).toBe(true);
    expect(isLgbtqTitle("Drag Brunch at the tavern")).toBe(true);
    expect(isLgbtqTitle("Drag Story Hour")).toBe(true);
    expect(isLgbtqTitle("Import vs. domestic drag racing")).toBe(false);
    expect(isLgbtqTitle("Dragon boat festival")).toBe(false);
  });

  it("keeps street names and lookalikes out", () => {
    expect(isLgbtqTitle("Gay Street cleanup day")).toBe(false);
    expect(isLgbtqTitle("Bluegrass on the creek")).toBe(false);
    expect(isLgbtqTitle("Trivia night")).toBe(false);
  });
});

describe("isLgbtqEvent", () => {
  it("joins on The Frederick Center as a verified venue", () => {
    // Programming AT the county's LGBTQ+ hub counts even when the title
    // alone says nothing (Magic meetups, movie nights).
    expect(
      isLgbtqEvent({
        title: "Magic: the Gathering at The Frederick Center",
        venue_place_slug: "the-frederick-center",
        venue_name: "The Frederick Center",
      }),
    ).toBe(true);
    expect(
      isLgbtqEvent({
        title: "Movie Night: Muppet Treasure Island",
        venue_place_slug: "the-frederick-center",
        venue_name: "The Frederick Center",
      }),
    ).toBe(true);
  });

  it("falls back to the venue-name text when no slug resolved", () => {
    expect(
      isLgbtqEvent({
        title: "Community potluck",
        venue_place_slug: undefined,
        venue_name: "The Frederick Center, Inc.",
      }),
    ).toBe(true);
  });

  it("does not claim ordinary events at ordinary venues", () => {
    expect(
      isLgbtqEvent({
        title: "Yoga in the taproom",
        venue_place_slug: "monocacy-brewing-frederick",
        venue_name: "Monocacy Brewing",
      }),
    ).toBe(false);
  });

  it("keeps a titled event at any venue", () => {
    // TFC fundraisers travel to partner venues; the title carries it.
    expect(
      isLgbtqEvent({
        title: "Beach, Please! Drag Bingo",
        venue_place_slug: "steinhardt-brewing-company-frederick",
        venue_name: "Steinhardt Brewing Company",
      }),
    ).toBe(true);
  });
});
