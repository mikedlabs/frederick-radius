import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASK_CLIENT_DEADLINE_MS,
  askAreaChipLabel,
  askAreaNeedsChoice,
  askCorrectionResultRef,
  askSourcePhotoSrc,
  askStarterWindow,
  askStarters,
  askStartersForWindow,
  askEvidenceLabels,
  askFailureForAbortReason,
  askQuestionPath,
  askResultHeading,
  askVisibleRecommendationSummary,
  canDisplayAskSourcePhoto,
  explicitAreaInQuery,
  hasResolvedNearbyArea,
  nearbyQueryNeedsAreaChoice,
  preferredAskScope,
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
      hoursLimitation: null,
    });
  });

  it("uses recommendation language only for an explicit ranked primary result", () => {
    expect(askEvidenceLabels({ isPrimaryRankedResult: true })).toEqual({
      sourceLabel: "Best match",
      explanationLabel: "Why it fits",
      hoursLimitation: null,
    });
  });

  it.each([
    [
      "now" as const,
      "Radius has not confirmed that this place is open now. Check before you go.",
    ],
    [
      "tonight" as const,
      "Radius has not confirmed this place's hours for tonight. Check before you go.",
    ],
  ])(
    "qualifies a primary place recommendation when %s depends on unknown hours",
    (timeNeed, hoursLimitation) => {
      expect(
        askEvidenceLabels(
          {
            href: "/places/gravel-and-grind-frederick",
            isPrimaryRankedResult: true,
            status: "At 7:00 PM · Hours not posted",
          },
          timeNeed,
        ),
      ).toEqual({
        sourceLabel: "Possible match",
        explanationLabel: "Why it may fit",
        hoursLimitation,
      });
      expect(
        askVisibleRecommendationSummary(
          "Gravel & Grind is the best match for coffee.",
          hoursLimitation,
        ),
      ).toBe("Gravel & Grind is a possible match for coffee.");
    },
  );

  it("keeps verified and event recommendations authoritative", () => {
    expect(
      askEvidenceLabels(
        {
          href: "/places/cafe-nola-frederick",
          isPrimaryRankedResult: true,
          status: "Open until 10pm",
        },
        "now",
      ),
    ).toEqual({
      sourceLabel: "Best match",
      explanationLabel: "Why it fits",
      hoursLimitation: null,
    });
    expect(
      askEvidenceLabels(
        {
          href: "/events/alive-at-five",
          isPrimaryRankedResult: true,
        },
        "tonight",
      ).sourceLabel,
    ).toBe("Best match");
  });
});

describe("Ask Radius nearby context", () => {
  it("reuses a fresh consented device fix instead of the unscoped county default", () => {
    expect(preferredAskScope(null, true)).toBe("nearme");
    expect(preferredAskScope("nearme", true)).toBe("nearme");

    // Explicit browsing choices remain authoritative. Device permission
    // should sharpen an unscoped answer, not silently discard a chosen area.
    expect(preferredAskScope("county", true)).toBe("county");
    expect(preferredAskScope("town:brunswick", true)).toBe("town:brunswick");
    expect(preferredAskScope("county", false)).toBe("county");
  });

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

  it("keeps Ask corrections tied to a canonical local result", () => {
    expect(
      askCorrectionResultRef([
        { href: "/places/first-source" },
        {
          href: "/events/alive-at-five?from=ask#details",
          isPrimaryRankedResult: true,
        },
      ]),
    ).toBe("/events/alive-at-five");
    expect(
      askCorrectionResultRef([{ href: "/places/cafe-nola?from=ask" }]),
    ).toBe("/places/cafe-nola");
    expect(
      askCorrectionResultRef([{ href: "https://example.com/source" }]),
    ).toBeNull();
    expect(askCorrectionResultRef([])).toBeNull();
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

describe("Ask Radius source thumbnails", () => {
  it("requests the proxy's failure signal instead of the photo-unavailable plate", () => {
    const src = askSourcePhotoSrc({
      href: "/places/cafe-nola",
      photo_url: "/api/place-photo?name=places%2Fid%2Fphotos%2Fphoto&w=800",
    });
    expect(src).not.toBeNull();
    const url = new URL(src!, "https://frederickradius.app");
    expect(url.pathname).toBe("/api/place-photo");
    expect(url.searchParams.get("fallback")).toBe("signal");
    expect(url.searchParams.get("name")).toBe("places/id/photos/photo");
  });

  it("leaves a first-party image alone and skips photos it cannot attribute", () => {
    expect(
      askSourcePhotoSrc({
        href: "/events/live-music",
        photo_url: "/images/events/live-music.jpg",
      }),
    ).toBe("/images/events/live-music.jpg");
    expect(
      askSourcePhotoSrc({
        href: "/events/live-music",
        photo_url: "/api/place-photo?name=places%2Fid%2Fphotos%2Fphoto",
      }),
    ).toBeNull();
    expect(askSourcePhotoSrc({ href: "/places/cafe-nola" })).toBeNull();
  });
});

describe("Ask Radius area chip", () => {
  it("asks for an area instead of claiming the county when nothing is chosen", () => {
    expect(askAreaNeedsChoice(null, false, null)).toBe(true);
    expect(askAreaChipLabel(null, false, null)).toBe("Choose area");
  });

  it("treats a remembered Near me choice without a device fix as unchosen", () => {
    expect(askAreaNeedsChoice("nearme", false, null)).toBe(true);
    expect(askAreaNeedsChoice("nearme", false, "town:frederick")).toBe(true);
    expect(askAreaChipLabel("nearme", false, null)).toBe("Choose area");
  });

  it("keeps a deliberate county, town, device fix, or saved home", () => {
    expect(askAreaChipLabel("county", false, null)).toBe("County");
    expect(askAreaChipLabel("town:frederick", false, null)).toBe("Frederick");
    expect(askAreaChipLabel("nearme", true, null)).toBe("Near me");
    expect(askAreaChipLabel(null, true, null)).toBe("Near me");
    expect(askAreaChipLabel(null, false, "town:frederick")).toBe(
      "Home · Frederick",
    );
    for (const [scope, device, home] of [
      ["county", false, null],
      ["town:urbana", false, null],
      [null, true, null],
      [null, false, "town:brunswick"],
    ] as const) {
      expect(askAreaNeedsChoice(scope, device, home)).toBe(false);
    }
  });

  it("says Choose area exactly when a local hunt would stop to ask", () => {
    const localHunt = "Where can I get pizza?";
    for (const [scope, device, home] of [
      [null, false, null],
      ["nearme", false, null],
      ["county", false, null],
      ["town:frederick", false, null],
      [null, true, null],
      [null, false, "town:brunswick"],
    ] as const) {
      const gateScope = scope ?? home;
      expect(nearbyQueryNeedsAreaChoice(localHunt, gateScope, device)).toBe(
        askAreaNeedsChoice(scope, device, home),
      );
    }
  });
});

describe("Ask Radius starter questions", () => {
  const LATE_EVENING = new Date("2026-10-07T22:45:00-04:00");
  const AFTERNOON = new Date("2026-10-07T14:30:00-04:00");
  const EARLY_EVENING = new Date("2026-10-07T18:15:00-04:00");
  const OVERNIGHT = new Date("2026-10-08T01:30:00-04:00");
  const WINDOWS = ["overnight", "daytime", "evening", "late-evening"] as const;

  it("offers tomorrow's events and tomorrow-morning coffee at 10:45 PM", () => {
    expect(askStarterWindow(LATE_EVENING)).toBe("late-evening");
    expect(askStarters(LATE_EVENING)).toEqual([
      {
        label: "See events tomorrow",
        query: "What events are happening tomorrow?",
      },
      {
        label: "See events this weekend",
        query: "What events are happening this weekend?",
      },
      {
        label: "Find coffee in Frederick City tomorrow",
        query: "Where can I get coffee tomorrow morning in Frederick City?",
      },
    ]);
  });

  it("offers tonight's events and town coffee in the afternoon", () => {
    expect(askStarterWindow(AFTERNOON)).toBe("daytime");
    expect(askStarters(AFTERNOON)).toEqual([
      {
        label: "See events tonight",
        query: "What events are happening tonight?",
      },
      {
        label: "See events this weekend",
        query: "What events are happening this weekend?",
      },
      {
        label: "Find coffee in Frederick City",
        query: "Where can I get coffee in Frederick City?",
      },
    ]);
  });

  it("switches from tonight to tomorrow at 8 PM Eastern in either offset", () => {
    expect(askStarters(new Date("2026-10-07T19:59:00-04:00"))[0].query).toBe(
      "What events are happening tonight?",
    );
    expect(askStarters(new Date("2026-10-07T20:00:00-04:00"))[0].query).toBe(
      "What events are happening tomorrow?",
    );
    // A UTC server reads 01:00 on the next day; Frederick is still at 8 PM.
    expect(askStarters(new Date("2026-12-10T20:00:00-05:00"))[0].query).toBe(
      "What events are happening tomorrow?",
    );
    expect(askStarters(new Date("2026-12-10T19:30:00-05:00"))[0].query).toBe(
      "What events are happening tonight?",
    );
  });

  it("keeps tonight's events in the early evening but looks ahead for coffee", () => {
    expect(askStarterWindow(EARLY_EVENING)).toBe("evening");
    expect(askStarters(EARLY_EVENING).map((starter) => starter.query)).toEqual([
      "What events are happening tonight?",
      "What events are happening this weekend?",
      "Where can I get coffee tomorrow morning in Frederick City?",
    ]);
  });

  it("calls the new calendar day today after midnight", () => {
    expect(askStarterWindow(OVERNIGHT)).toBe("overnight");
    expect(askStarters(OVERNIGHT)[0].query).toBe(
      "What events are happening today?",
    );
  });

  it("never offers a dinner, open-late, or planner starter", () => {
    for (const starterWindow of WINDOWS) {
      for (const starter of askStartersForWindow(starterWindow)) {
        expect(starter.query).not.toMatch(
          /\b(?:plan|dinner|eat|open late|still open|worth doing)\b/i,
        );
        expect(starter.label).not.toMatch(/\b(?:plan|dinner)\b/i);
      }
    }
  });

  it("runs every starter without stopping at the area chooser", () => {
    for (const starterWindow of WINDOWS) {
      for (const starter of askStartersForWindow(starterWindow)) {
        expect(nearbyQueryNeedsAreaChoice(starter.query, null, false)).toBe(
          false,
        );
      }
    }
    expect(
      explicitAreaInQuery(
        "Where can I get coffee tomorrow morning in Frederick City?",
      ),
    ).toBe("town:frederick");
  });
});
