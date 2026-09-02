import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";

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
      data.scheduleItems
        .filter((item) => item.sourceItem.text.length > 200)
        .every((item) => item.detail === item.sourceItem.text),
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
    expect(kidZone?.title).toBe("Kid Zone: Free fun for all ages!");
    expect(kidZone?.detail).toContain("gffair.com/free");
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
    expect(transit?.summary).toContain("EFS and 15");
    expect(transit?.summary).toContain("not a service promise");
    expect(transit?.summary).toContain("arrival times are not confirmed");
    expect(transit?.paymentLabel).toContain("fare-free");
    expect(drive?.summary).toContain("free ADA-compliant shuttle");
    expect(drive?.summary).toContain("Use I-70 Exit 56");
    expect(drive?.summary).toContain("Regular parking is not sold in advance");
    expect(drive?.summary).toContain(
      "This is a Fair parking shuttle, not county Transit",
    );
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
        "https://www.etix.com/ticket/v/11115/the-great-frederick-fair-advanced-gate?partner_id=944",
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
    expect(data.source.ageLabel).toBe("The source was checked today");
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
