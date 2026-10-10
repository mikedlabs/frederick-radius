import { describe, expect, it } from "vitest";
import { classifyEvent, isPublicEvent } from "@/lib/events/classify";
import sources from "@/../config/civicengage_sources.json" with { type: "json" };
import {
  CITY_CIVICENGAGE_DOMAIN,
  COUNTY_CIVICENGAGE_DOMAIN,
  civicEngageRadiusCategory,
  isSurfacedCivicEngageCategory,
  lookupCivicEngageCategory,
} from "./civicengage-category";

type Source = {
  municipality: string;
  domain: string;
  enabled: boolean;
  catids: number[];
};

const list = sources as unknown as Source[];

function hit(domain: string, catID: number, title: string) {
  const mapped = lookupCivicEngageCategory(domain, catID);
  expect(mapped, `${domain} catID ${catID} (${title})`).not.toBeNull();
  return { title, ...mapped! };
}

describe("lookupCivicEngageCategory — live-verified catID groups", () => {
  it("maps Aging and Independence (64) to community", () => {
    const event = hit(COUNTY_CIVICENGAGE_DOMAIN, 64, "Seniors in the Park");
    expect(event.category).toBe("community");
    expect(event.scope).toBe("public");
  });

  it("maps Liquor Board special licenses (74) to community, never family", () => {
    const event = hit(COUNTY_CIVICENGAGE_DOMAIN, 74, "Ambulance Co. Bingo");
    expect(event.category).toBe("community");
    expect(event.category).not.toBe("family");
    expect(event.scope).toBe("public");
    expect(civicEngageRadiusCategory(COUNTY_CIVICENGAGE_DOMAIN, 74)).not.toBe(
      "family",
    );
    // A 21+ fundraiser must not inherit the family/kids intent or lane.
    expect(classifyEvent(event)).toBe("public");
    expect(isPublicEvent(event)).toBe(true);
  });

  it("maps Fire & Rescue (94) to family", () => {
    const event = hit(
      COUNTY_CIVICENGAGE_DOMAIN,
      94,
      "Monthly Car Seat Checkups",
    );
    expect(event.category).toBe("family");
    expect(event.scope).toBe("public");
  });

  it("maps Energy and Environment (50) to outdoors and Solid Waste (88) to community", () => {
    expect(hit(COUNTY_CIVICENGAGE_DOMAIN, 50, "Meet DEE Staff in Your Community!").category).toBe(
      "outdoors",
    );
    expect(hit(COUNTY_CIVICENGAGE_DOMAIN, 88, 'Film screening "Plastic People"').category).toBe(
      "community",
    );
  });

  it("maps City Parks & Recreation (27) to family", () => {
    const event = hit(CITY_CIVICENGAGE_DOMAIN, 27, "Restorative Yoga");
    expect(event.category).toBe("family");
    expect(event.scope).toBe("public");
  });

  it("maps civic meetings to civic", () => {
    const event = hit(COUNTY_CIVICENGAGE_DOMAIN, 77, "Planning Commission");
    expect(event.category).toBe("civic");
    expect(event.scope).toBe("public");
    expect(classifyEvent(event)).toBe("civic_meeting");
    expect(isPublicEvent(event)).toBe(false);
  });

  it("maps Equity Office observances (71) and Procurement (25) to notice scope", () => {
    const observance = hit(COUNTY_CIVICENGAGE_DOMAIN, 71, "World Religion Day");
    expect(observance.category).toBe("civic");
    expect(observance.scope).toBe("notice");
    expect(classifyEvent(observance)).toBe("civic_meeting");
    expect(isPublicEvent(observance)).toBe(false);

    const rfp = hit(COUNTY_CIVICENGAGE_DOMAIN, 25, "RFP/IFB openings");
    expect(rfp.category).toBe("civic");
    expect(rfp.scope).toBe("notice");
  });

  it("maps City Economic Development (23) to a public community event, not family", () => {
    const event = hit(
      CITY_CIVICENGAGE_DOMAIN,
      23,
      "Partner Hours at Maryland's EDGE",
    );
    expect(event.category).toBe("community");
    expect(event.category).not.toBe("family");
    expect(event.scope).toBe("public");
    expect(classifyEvent(event)).toBe("public");
  });

  it("does not confuse City 14 (civic) with an unmapped county 14", () => {
    expect(lookupCivicEngageCategory(CITY_CIVICENGAGE_DOMAIN, 14)?.category).toBe(
      "civic",
    );
    expect(lookupCivicEngageCategory(COUNTY_CIVICENGAGE_DOMAIN, 14)).toBeNull();
  });

  it("returns null for unknown domain or catID", () => {
    expect(lookupCivicEngageCategory("www.thurmont.com", 14)).toBeNull();
    expect(lookupCivicEngageCategory(COUNTY_CIVICENGAGE_DOMAIN, 96)).toBeNull();
    expect(civicEngageRadiusCategory(COUNTY_CIVICENGAGE_DOMAIN, 99)).toBeNull();
  });
});

describe("enabled Frederick County and City catIDs", () => {
  it("have a Radius mapping for every enabled county and city catID", () => {
    const mapped = list.filter(
      (src) =>
        src.enabled &&
        (src.domain === COUNTY_CIVICENGAGE_DOMAIN ||
          src.domain === CITY_CIVICENGAGE_DOMAIN),
    );
    expect(mapped.length).toBe(2);
    for (const src of mapped) {
      for (const catID of src.catids) {
        expect(
          lookupCivicEngageCategory(src.domain, catID),
          `${src.municipality} catID ${catID}`,
        ).not.toBeNull();
      }
    }
  });
});

describe("isSurfacedCivicEngageCategory", () => {
  it("keeps real Radius slugs and quarantines leftover CivicEngage labels", () => {
    expect(isSurfacedCivicEngageCategory("community")).toBe(true);
    expect(isSurfacedCivicEngageCategory("family")).toBe(true);
    expect(isSurfacedCivicEngageCategory("civic")).toBe(true);
    expect(isSurfacedCivicEngageCategory("outdoors")).toBe(true);
    expect(isSurfacedCivicEngageCategory("Workforce Services")).toBe(false);
    expect(isSurfacedCivicEngageCategory("Parks & Recreation")).toBe(false);
    expect(isSurfacedCivicEngageCategory(null)).toBe(false);
  });
});
