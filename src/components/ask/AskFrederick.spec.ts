import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASK_CLIENT_DEADLINE_MS,
  askEvidenceLabels,
  askFailureForAbortReason,
  askQuestionPath,
  askResultHeading,
  canDisplayAskSourcePhoto,
  explicitAreaInQuery,
  hasResolvedNearbyArea,
  nearbyQueryNeedsAreaChoice,
  queryNeedsNearbyContext,
  queryIsLocalDiscovery,
  scheduleAskDeadline,
  sourceHasDistinctDetail,
  sourceSaveTarget,
} from "./AskFrederick";

afterEach(() => {
  vi.useRealTimers();
});

describe("Ask Radius question links", () => {
  it("encodes only the bounded, self-contained question", () => {
    expect(askQuestionPath("  dinner & live music tonight  ")).toBe(
      "/ask?q=dinner%20%26%20live%20music%20tonight",
    );
    expect(askQuestionPath("   ")).toBe("/ask");
    expect(
      new URL(askQuestionPath("closer"), "https://frederickradius.app").searchParams.get(
        "q",
      ),
    ).toBe("closer");
    expect(askQuestionPath("x".repeat(400))).toBe(`/ask?q=${"x".repeat(300)}`);
  });
});

describe("Ask Radius evidence labels", () => {
  it("describes ordinary source cards as evidence, not recommendations", () => {
    expect(askEvidenceLabels({})).toEqual({
      sourceLabel: "Source",
      explanationLabel: "What Radius found",
    });
  });

  it("uses recommendation language only for an explicit ranked primary result", () => {
    expect(askEvidenceLabels({ isPrimaryRankedResult: true })).toEqual({
      sourceLabel: "Best match",
      explanationLabel: "Why it fits",
    });
  });
});

describe("Ask Radius nearby context", () => {
  it("recognizes questions that need a deliberate location", () => {
    expect(queryNeedsNearbyContext("Find breakfast near me")).toBe(true);
    expect(queryNeedsNearbyContext("Where is the closest trash can?")).toBe(true);
    expect(queryNeedsNearbyContext("What is within walking distance from me?")).toBe(true);
    expect(queryNeedsNearbyContext("Plan a walkable date night downtown")).toBe(false);
    expect(queryNeedsNearbyContext("What events are happening tonight?")).toBe(false);
  });

  it("accepts the whole county, a town, or a device fix as a deliberate area", () => {
    expect(hasResolvedNearbyArea(null, false)).toBe(false);
    expect(hasResolvedNearbyArea("nearme", false)).toBe(false);
    expect(hasResolvedNearbyArea("county", false)).toBe(true);
    expect(hasResolvedNearbyArea("town:urbana", false)).toBe(true);
    expect(hasResolvedNearbyArea(null, true)).toBe(true);
    expect(nearbyQueryNeedsAreaChoice("Breakfast near me", null, false)).toBe(true);
    expect(nearbyQueryNeedsAreaChoice("Breakfast near me", "county", false)).toBe(true);
    expect(nearbyQueryNeedsAreaChoice("Breakfast near me", "town:urbana", false)).toBe(false);
    expect(
      nearbyQueryNeedsAreaChoice(
        "Coffee near me in Frederick County",
        "county",
        false,
      ),
    ).toBe(false);
    expect(nearbyQueryNeedsAreaChoice("Breakfast near me", null, true)).toBe(false);
  });

  it("treats inherently-local discovery as needing an area, even without 'near me'", () => {
    // Owner: a bare "pizza" wants pizza NEAR you — ask for an area first.
    expect(queryIsLocalDiscovery("pizza")).toBe(true);
    expect(queryIsLocalDiscovery("where can I get good coffee")).toBe(true);
    expect(queryIsLocalDiscovery("Where should I eat tonight?")).toBe(true);
    expect(queryIsLocalDiscovery("breweries")).toBe(true);
    expect(queryIsLocalDiscovery("Where can I rent a bicycle?")).toBe(true);
    expect(queryIsLocalDiscovery("Where can I find a bike repair stand?")).toBe(true);
    expect(queryIsLocalDiscovery("Where can I get a kayak?")).toBe(true);
    // Informational / civic / event questions are NOT local hunts.
    expect(queryIsLocalDiscovery("what events are this weekend")).toBe(false);
    expect(queryIsLocalDiscovery("how do I pay my water bill")).toBe(false);
    expect(queryIsLocalDiscovery("what's the weather tomorrow")).toBe(false);
    expect(queryIsLocalDiscovery("Where can I get a building permit?")).toBe(false);
    expect(queryIsLocalDiscovery("Where can I find county budget data?")).toBe(false);
    expect(queryIsLocalDiscovery("Where can I register to vote?")).toBe(false);

    // The gate now fires for "pizza" with no location and no town...
    expect(nearbyQueryNeedsAreaChoice("pizza", null, false)).toBe(true);
    // ...but not once a town is named, a device fix exists, or the county is chosen.
    expect(nearbyQueryNeedsAreaChoice("pizza in Brunswick", null, false)).toBe(false);
    expect(nearbyQueryNeedsAreaChoice("pizza", null, true)).toBe(false);
    expect(
      nearbyQueryNeedsAreaChoice(
        "Where can I rent a bicycle?",
        null,
        false,
      ),
    ).toBe(true);
    expect(nearbyQueryNeedsAreaChoice("what events are this weekend", null, false)).toBe(false);
  });

  it("maps only deliberate client abort reasons to actionable failures", () => {
    expect(ASK_CLIENT_DEADLINE_MS).toBe(22_000);
    expect(askFailureForAbortReason("ask-timeout")).toBe("timeout");
    expect(askFailureForAbortReason("ask-cancelled")).toBe("cancelled");
    expect(askFailureForAbortReason(new DOMException("Aborted", "AbortError"))).toBeNull();
    expect(askFailureForAbortReason(undefined)).toBeNull();
  });

  it("ends a stalled client request at the bounded deadline", () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    scheduleAskDeadline(controller);

    vi.advanceTimersByTime(ASK_CLIENT_DEADLINE_MS - 1);
    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.signal.aborted).toBe(true);
    expect(askFailureForAbortReason(controller.signal.reason)).toBe("timeout");
  });

  it("respects a place named in the question", () => {
    expect(explicitAreaInQuery("Coffee in Urbana right now")).toBe("town:urbana");
    expect(explicitAreaInQuery("Dinner in New Market")).toBe("town:new-market");
    expect(explicitAreaInQuery("Steak near downtown Frederick")).toBe("town:frederick");
    expect(explicitAreaInQuery("A walkable date night downtown")).toBe("town:frederick");
    expect(explicitAreaInQuery("Coffee in downtown Brunswick")).toBe("town:brunswick");
    expect(explicitAreaInQuery("What is happening in Frederick County?")).toBe("county");
    expect(explicitAreaInQuery("What is open tonight?")).toBeNull();
  });

  it("does not interrupt a local search that already names downtown Frederick", () => {
    expect(
      nearbyQueryNeedsAreaChoice(
        "I want a steak dinner near downtown Frederick at 7:30 tonight",
        "county",
        false,
      ),
    ).toBe(false);
  });

  it("derives saved IDs from the real detail link", () => {
    expect(sourceSaveTarget({ href: "/places/cafe-nola-frederick" })).toEqual({
      type: "place",
      id: "cafe-nola-frederick",
    });
    expect(sourceSaveTarget({ href: "/events/alive-at-five?from=ask" })).toEqual({
      type: "event",
      id: "alive-at-five",
    });
    expect(sourceSaveTarget({ href: "https://example.com/source" })).toBeNull();
  });

  it("does not describe an upstream failure as an empty search", () => {
    const empty = { status: "empty" as const, intent: undefined };
    expect(askResultHeading(empty, "service")).toBe(
      "Radius could not complete that request.",
    );
    expect(askResultHeading(empty, null)).toBe(
      "Radius could not find a solid match.",
    );
  });

  it("hides a detail line when it only repeats the reason", () => {
    expect(
      sourceHasDistinctDetail({
        reason: "This local deli and coffee bar serves Rise Up…",
        detail: "This local deli and coffee bar serves Rise Up coffee and breakfast.",
      }),
    ).toBe(false);
    expect(
      sourceHasDistinctDetail({
        reason: "Best local fit for breakfast",
        detail: "Serves bagels, espresso, and breakfast sandwiches.",
      }),
    ).toBe(true);
  });

  it("shows a Google thumbnail only when it opens an attributed place view", () => {
    const photo_url = "/api/place-photo?name=places%2Fid%2Fphotos%2Fphoto&w=800";
    expect(canDisplayAskSourcePhoto({ href: "/places/cafe-nola", photo_url })).toBe(true);
    expect(canDisplayAskSourcePhoto({ href: "/events/live-music", photo_url })).toBe(false);
    expect(canDisplayAskSourcePhoto({ href: "https://example.com", photo_url })).toBe(false);
    expect(canDisplayAskSourcePhoto({
      href: "/events/live-music",
      photo_url: "/images/events/live-music.jpg",
    })).toBe(true);
  });
});
