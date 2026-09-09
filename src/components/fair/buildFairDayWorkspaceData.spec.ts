import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import { greatFrederickFair2026MapAdditions } from "@/data/fair/great-frederick-fair-2026-map-overlays";
import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";
import {
  fairTransitStopServiceSummary,
  fairTransitTravelSummary,
  greatFrederickFair2026TransitStops,
} from "@/data/fair/great-frederick-fair-2026-transit";

import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

const REVIEW_TIME = new Date("2026-09-01T20:00:00Z");

describe("buildFairDayWorkspaceData", () => {
  it("adapts every reviewed program row without replacing its source identity", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      REVIEW_TIME,
    );

    expect(data.scheduleItems).toHaveLength(
      greatFrederickFair2026PackPointer.itemCount,
    );
    expect(data.scheduleItems.every((item) => item.id === item.sourceItem.id)).toBe(
      true,
    );
    expect(Math.max(...data.scheduleItems.map((item) => item.title.length))).toBeLessThanOrEqual(
      120,
    );
    expect(
      data.scheduleItems.every((item) => item.sourceItem.text.trim().length > 0),
    ).toBe(true);
    expect(data.scheduleItems.some((item) => item.kind === "animal")).toBe(true);
    expect(data.scheduleItems.some((item) => item.kind === "agriculture")).toBe(
      true,
    );
    expect(
      data.scheduleItems.some((item) =>
        /\b(?:Arena|Grandstand|Infield)\b/.test(item.placeLabel),
      ),
    ).toBe(true);
    expect(
      data.scheduleItems
        .filter(
          (item) =>
            item.sourceItem.timeLabel === null &&
            item.sourceItem.inheritedTimeLabel === null &&
            /\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(item.sourceItem.text),
        )
        .every((item) => item.timeLabel === "Times listed in item"),
    ).toBe(true);
    const kidZone = data.scheduleItems.find((item) =>
      item.sourceItem.text.includes("gffair.com/free"),
    );
    expect(kidZone?.title).toBe("Kid Zone");
    expect(kidZone?.detail).toBe("Free fun for all ages!");
    expect(kidZone?.sourceItem.text).toContain("gffair.com/free");

    const beerGarden = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Beer Garden"),
    );
    const showcase = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith(
        "Homegrown Wineries, Breweries and Distilleries Showcase",
      ),
    );
    const daughtry = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Daughtry"),
    );
    const farmAndGarden = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Farm & Garden Building Opens"),
    );
    const horseExpo = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Horse Barrel Racing Expo"),
    );
    const householdBuilding = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Household Building Opens"),
    );
    expect(householdBuilding?.kind).toBe("exhibit");
    const nealMcCoy = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Neal McCoy"),
    );
    const dannyGokey = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Danny Gokey"),
    );
    const pop2000 = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("POP 2000's"),
    );
    const taylorTribute = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Let's Sing Taylor!"),
    );
    const warrenZeiders = data.scheduleItems.find((item) =>
      item.sourceItem.text.startsWith("Warren Zeiders"),
    );
    const demolitionDerby = data.scheduleItems.find((item) =>
      item.sourceItem.text.includes("Demolition Derby"),
    );

    expect(beerGarden).toMatchObject({
      kind: "food",
      title: "Beer Garden",
      detail:
        "Under the MICHELOB ULTRA sign, next to Farm & Garden · Michelob Ultra, Wantz Distributors",
    });
    expect(showcase).toMatchObject({
      kind: "food",
      title: "Homegrown Wineries, Breweries and Distilleries Showcase",
      detail: "Fred. Co. Office of Agriculture",
      placeLabel: "Published place: Bldg. 13.",
    });
    expect(daughtry).toMatchObject({
      kind: "concert",
      title: "Daughtry",
      timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
      placeLabel: "Published place: Grandstand.",
    });
    expect(daughtry?.detail).toContain("8 p.m. headliner");
    expect(daughtry?.detail).toContain("does not name the opener");
    expect(daughtry?.sourceItem.text).toContain(
      "Presented by Team Reeder",
    );
    expect(daughtry).toMatchObject({
      sourceUrl: "https://thegreatfrederickfair.com/grandstand/",
      sourceReview: {
        reviewedOn: "2026-09-04",
        validThrough: "2026-09-26",
        sourceRevision: "manual-review-2026-09-04",
      },
      performanceSlots: [
        {
          role: "opener",
          startsAt: "2026-09-18T18:30:00-04:00",
        },
        {
          role: "headliner",
          name: "Daughtry",
          startsAt: "2026-09-18T20:00:00-04:00",
        },
      ],
    });
    expect(farmAndGarden).toMatchObject({
      detail: "Grange Day",
      placeLabel: "Published place: Bldg. 14A.",
    });
    expect(horseExpo).toMatchObject({
      detail: undefined,
      placeLabel:
        "Published place: Elm Street Development, Ryan Homes & NV Homes Equine Arena, Infield, Pleasants' Horse Park.",
    });
    expect(householdBuilding?.placeLabel).toBe(
      "Published place: Household Building.",
    );
    expect(nealMcCoy?.placeLabel).toBe("Published place: Grandstand.");
    expect(nealMcCoy).toMatchObject({
      kind: "concert",
      title: "Neal McCoy",
      timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
      detail: "Mark Wills opens at 6:30 p.m. Neal McCoy headlines at 8 p.m.",
    });
    expect(dannyGokey).toMatchObject({
      kind: "concert",
      title: "Danny Gokey",
      timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
      detail:
        "When Radius checked on September 4, both official pages listed the 6:30 p.m. opener as TBA. Danny Gokey headlines at 8 p.m.",
    });
    expect(pop2000).toMatchObject({
      kind: "concert",
      title: "POP 2000 Tour",
      timeLabel: "7:30 p.m.",
      detail:
        "When Radius checked on September 4, the Fair's schedule and Grandstand page named different lead performers. Both listed LFO, OTOWN, and Ryan Cabrera; check the official event page for updates.",
    });
    expect(pop2000?.detail).not.toContain("Jeff Timmons");
    expect(taylorTribute).toMatchObject({
      kind: "concert",
      title: "Let's Sing Taylor!",
      timeLabel: "6 p.m.",
    });
    expect(warrenZeiders).toMatchObject({
      kind: "concert",
      title: "Warren Zeiders",
      timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
      detail:
        "When Radius checked on September 4, both official pages listed Chris Darlington at 6:30 p.m. Warren Zeiders headlines at 8 p.m.",
    });
    expect(data.scheduleItems.filter((item) => item.kind === "concert")).toHaveLength(
      6,
    );
    expect(demolitionDerby?.kind).toBe("motorsport");
    for (const publishedAnimalTitle of [
      "Youth Turkey Show",
      "Youth Dog Show",
      "Youth Pretty Pig Contest",
      "Youth Alpaca Show",
      "Youth Pretty Cow Contest",
      "Youth Beef Market Show",
      "Northeast Texas Longhorn Regional Show",
      "Supreme LegenDAIRY Showcase",
    ]) {
      expect(
        data.scheduleItems.find((item) =>
          item.sourceItem.text.startsWith(publishedAnimalTitle),
        )?.kind,
      ).toBe("animal");
    }
    for (const publishedFoodTitle of [
      'Taste of "Home Grown Frederick"',
      "Ice Cream in a Bag Demonstration",
    ]) {
      expect(
        data.scheduleItems.find((item) =>
          item.sourceItem.text.startsWith(publishedFoodTitle),
        )?.kind,
      ).toBe("food");
    }
  });

  it("keeps county Transit and the Fair parking shuttle as separate facts", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      REVIEW_TIME,
    );
    const transit = data.arrivalOptions.find(
      (option) => option.planChoice === "transit",
    );
    const drive = data.arrivalOptions.find(
      (option) => option.planChoice === "drive",
    );

    expect(transit?.summary).toContain(
      "East Patrick Street at Fairground Center",
    );
    expect(transit?.summary).toBe(fairTransitTravelSummary());
    expect(transit?.summary).toContain("6:17 AM through 9:17 PM");
    expect(transit?.summary).toContain("not a live arrival prediction");
    expect(transit?.paymentLabel).toContain("fare-free");
    expect(drive?.summary).toContain("free ADA-compliant shuttle");
    expect(drive?.summary).toContain("Use I-70 Exit 56");
    expect(drive?.summary).toContain("Regular parking is not sold in advance");
    expect(drive?.summary).toContain(
      "This is a Fair parking shuttle, not county Transit",
    );
    expect(data.parkingGlance).toEqual({
      satellitePriceLabel: "$10",
      satellitePaymentLabel: "cash",
      infieldPriceLabel: "$15",
      infieldPaymentLabel: "cash or credit card",
    });
    expect(data.dates[0]).toMatchObject({
      date: "2026-09-18",
      gateOpensAt: "2026-09-18T20:00:00.000Z",
      gateClosesAt: "2026-09-19T02:00:00.000Z",
    });
    expect(data.entryDetail).toContain("Apple Pay is not accepted");
    expect(data.ticketWalletHelpUrl).toBe(
      "https://support.etix.com/general-info/what-is-etix-wallet-and-how-do-i-use-it",
    );
    expect(data.externalGuide).toEqual({
      label: "Official external EventHub guide",
      detail:
        "The Fair links to EventHub for its 2026 vendor floorplan and exhibitor directory. Radius opens it as an external guide and does not treat that floorplan as reviewed map geometry.",
      url: "https://mobile.eventhub-floorplan.net/?Show_ID=18209",
    });
  });

  it("uses one reviewed transit truth for Travel and the Fair map", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      REVIEW_TIME,
    );
    const transit = data.arrivalOptions.find(
      (option) => option.planChoice === "transit",
    );
    const fairgroundCenter = greatFrederickFair2026TransitStops.find(
      (stop) => stop.id === "162918",
    );
    const mappedStop = greatFrederickFair2026MapAdditions.find(
      (feature) => feature.properties.id === "transit-stop-162918",
    );

    expect(fairgroundCenter).toBeDefined();
    expect(transit?.summary).toBe(fairTransitTravelSummary());
    expect(mappedStop?.properties.detail).toContain(
      fairTransitStopServiceSummary(fairgroundCenter!),
    );
    expect(transit?.summary.includes("6:17 AM")).toBe(
      mappedStop?.properties.detail?.includes("6:17 AM"),
    );
  });

  it("keeps official Etix handoffs stable and free of transient trackers", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      REVIEW_TIME,
    );
    const purchaseUrls = data.offers
      .flatMap((offer) =>
        offer.officialPurchaseUrl ? [offer.officialPurchaseUrl] : [],
      )
      .filter((url, index, all) => all.indexOf(url) === index)
      .sort();

    expect(purchaseUrls).toEqual(
      [
        "https://www.etix.com/ticket/p/36957156/jack-pass-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
        "https://www.etix.com/ticket/p/66497377/carload-special-tuesday-sept22-lot-d-onlythe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
        "https://www.etix.com/ticket/p/61602326/advance-gate-admissionthe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
        "https://www.etix.com/ticket/p/65356930/blue-ribbon-bundle-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
      ].sort(),
    );
    for (const value of purchaseUrls) {
      const url = new URL(value);
      expect([...url.searchParams.keys()]).toEqual(["partner_id"]);
      expect(url.searchParams.get("partner_id")).toBe("944");
      expect(value).not.toMatch(/[?&](?:_gl|gclid|fbclid|utm_[^=]*)=/i);
    }
  });

  it("starts with an undecided device-local plan and current source metadata", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      REVIEW_TIME,
    );

    expect(data.initialPlan.packRevision).toBe(
      greatFrederickFair2026PackPointer.revision,
    );
    expect(data.initialPlan.arrivalChoice).toBe("undecided");
    expect(data.initialPlan.party).toEqual({
      adults11Plus: 0,
      children10Under: 0,
      adultRiders: 0,
      childRiders: 0,
    });
    expect(
      data.partyOffers.find(
        (offer) => offer.id === "offer-adult-admission-early",
      ),
    ).toMatchObject({
      kind: "adult-online-admission",
      unitPriceCents: 800,
      pastKnownDeadline: false,
    });
    expect(
      data.offers.find(
        (offer) => offer.id === "offer-adult-admission-gate",
      )?.placement,
    ).toBe("standard");
    expect(
      data.offers.find(
        (offer) => offer.id === "offer-military-day-admission",
      )?.placement,
    ).toBe("eligibility-promotion");
    expect(data.source.label).toContain(
      `${greatFrederickFair2026PackPointer.itemCount} program rows`,
    );
    expect(data.source.checkedLabel).toBe("August 29, 2026 at 8:52 AM");
    expect(data.source.ageLabel).toBe(
      "This imported program version is 3 days old",
    );
    expect(
      data.offers.find((offer) => offer.id === "offer-carload-special")?.detail,
    ).toContain("This offer is valid on September 22.");
    expect(
      data.offers.find((offer) => offer.id === "offer-jack-pass")
        ?.pastKnownDeadline,
    ).toBe(false);
    expect(data.practicalAnswers.map((answer) => answer.id)).toEqual(
      greatFrederickFair2026PracticalAnswers.map((answer) => answer.id),
    );
    expect(
      data.practicalAnswers.every((answer) =>
        answer.sources.every((source) => source.url.startsWith("https://")),
      ),
    ).toBe(true);
    expect(data.accessHighlights).toEqual([
      expect.objectContaining({
        id: "access-sensory-friendly-carnival",
        date: "2026-09-20",
        title: "Sensory-friendly carnival · noon–2 p.m.",
        answerId: "fair-answer-sensory-friendly-carnival",
      }),
    ]);
    expect(data.accessHighlights[0]?.detail).toContain(
      "does not describe this as a whole-ground low-sensory period",
    );
  });

  it("starts on the current Fair day when the server date is inside the run", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-22T16:00:00Z"),
    );

    expect(data.initialDate).toBe("2026-09-22");
    expect(data.initialPlan.selectedDayId).toBe("day-2026-09-22");
    expect(data.eventPhase).toBe("fair-day");
  });

  it("marks a known offer deadline as passed at the server review time", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T22:00:00Z"),
    );

    expect(
      data.offers.find((offer) => offer.id === "offer-jack-pass")
        ?.pastKnownDeadline,
    ).toBe(true);
    expect(
      data.partyOffers.find((offer) => offer.id === "offer-jack-pass")
        ?.pastKnownDeadline,
    ).toBe(true);
  });

  it("treats an exact known cutoff as closed for party calculations", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T21:00:00Z"),
    );

    expect(
      data.partyOffers.find(
        (offer) => offer.id === "offer-adult-admission-early",
      )?.pastKnownDeadline,
    ).toBe(true);
    expect(
      data.partyOffers.find((offer) => offer.id === "offer-jack-pass")
        ?.pastKnownDeadline,
    ).toBe(true);

    const carloadCutoff = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-22T23:00:00Z"),
    );
    expect(
      carloadCutoff.partyOffers.find(
        (offer) => offer.id === "offer-carload-special",
      )?.pastKnownDeadline,
    ).toBe(true);
  });
});
