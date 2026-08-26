import { describe, expect, it } from "vitest";
import { qualifiedSearchIndex, searchIndex } from "./index";
import { findDepartments } from "@/data/departments";

describe("deterministic map search actions", () => {
  it.each([
    ["trash cans near me", "/map?amenity=trash"],
    ["public restrooms", "/map?amenity=restroom"],
    ["drinking water", "/map?amenity=water"],
    ["dog bags", "/map?amenity=dog"],
    ["public Wi-Fi", "/map?amenity=wifi"],
    ["EV", "/map?amenity=ev"],
    ["ATM near me", "/map?q=ATM"],
    ["power outlets", "/map?amenity=outlet"],
    ["parking", "/map?show=parking"],
    ["bus stops", "/map?show=transit"],
    ["buses now", "/map?scene=buses-now"],
    ["roads now", "/map?scene=roads-now"],
    ["outside now", "/map?scene=outside-now"],
    ["what changed", "/map?scene=what-changed"],
    ["within 15 minutes", "/map?mode=radius&minutes=15"],
    ["weather radar", "/map?show=radar"],
    ["traffic cameras", "/map?show=cameras"],
    ["traffic incidents", "/map?show=incidents"],
    ["hiking trails", "/map?show=trails"],
    ["tonight", "/map?t=tonight"],
    ["events this weekend", "/map?t=weekend"],
  ])("leads %s with %s", (query, href) => {
    const results = qualifiedSearchIndex(query, 8, []).results;
    expect(results[0]).toMatchObject({
      type: "action",
      href,
    });
  });

  it("does not confuse parking with the parks layer", () => {
    const parking = searchIndex("parking", 12, []);
    const parkingVerb = searchIndex("where can I park downtown", 12, []);

    expect(parking[0]?.href).toBe("/map?show=parking");
    expect(parkingVerb[0]?.href).toBe("/map?show=parking");
    expect([...parking, ...parkingVerb].some((result) => result.id === "layer:parks")).toBe(false);
  });

  it("offers the reviewed park-place map for a parks request", () => {
    expect(searchIndex("parks", 8, [])[0]).toMatchObject({
      id: "action:map-parks",
      href: "/map?intent=outdoor&sub=parks",
    });
  });

  it.each(["hiking trail", "playground", "park"])(
    "keeps an actual place within the first two Radius results for %s",
    (query) => {
      const results = qualifiedSearchIndex(query, 8, []).results;
      expect(results.slice(0, 2).some((result) => result.type === "place")).toBe(true);
    },
  );

  it("keeps service and utility problems out of amenity actions", () => {
    expect(searchIndex("trash pickup schedule", 8, []).some((result) => result.href === "/map?amenity=trash")).toBe(false);
    expect(searchIndex("river water levels", 8, []).some((result) => result.href === "/map?amenity=water")).toBe(false);
    expect(searchIndex("power outage", 8, []).some((result) => result.href === "/map?amenity=outlet")).toBe(false);
  });

  it("does not turn short utility nouns into unrelated quick actions", () => {
    const er = qualifiedSearchIndex("ER", 10, []).results;
    const ev = qualifiedSearchIndex("EV", 10, []).results;
    const ups = qualifiedSearchIndex("UPS", 10, []).results;

    expect(er[0]?.href).toBe("/emergency");
    expect(er.slice(0, 10).some((result) => result.href === "/tonight")).toBe(false);
    expect(er.slice(0, 10).some((result) => /erica/i.test(result.title))).toBe(false);
    expect(ev[0]?.href).toBe("/map?amenity=ev");
    expect(ev.slice(0, 10).some((result) => result.href === "/events")).toBe(false);
    expect(ups[0]?.href).toBe("/shipping");
    expect(ups).toHaveLength(1);
  });

  it("routes ATM to live map search without presenting banks as confirmed ATMs", () => {
    const results = qualifiedSearchIndex("ATM", 10, []).results;
    expect(results[0]).toMatchObject({
      id: "action:map-atm",
      href: "/map?q=ATM",
    });
    expect(results.some((result) => result.type === "place")).toBe(false);
  });

  it("routes DMV to the verified state MVA contact without catalog padding", () => {
    expect(findDepartments("DMV", 2)[0]).toMatchObject({
      slug: "state-mva",
      jurisdiction: "state",
    });
    expect(qualifiedSearchIndex("DMV", 10, []).results).toEqual([]);
  });

  it("answers Wi-Fi with the live amenity control instead of place-name noise", () => {
    const results = qualifiedSearchIndex("WiFi", 10, []).results;

    expect(results[0]).toMatchObject({
      id: "action:map-wifi",
      href: "/map?amenity=wifi",
    });
    expect(results.some((result) => result.type === "place")).toBe(false);
  });

  it("keeps an explicit planning request on the tonight planner", () => {
    expect(searchIndex("plan tonight", 8, [])[0]).toMatchObject({
      id: "action:tonight",
      href: "/tonight",
    });
  });

  it.each([
    ["public restroom near me", /restroom|bathroom|toilet/i],
    ["trash can near me", /trash|garbage|waste/i],
    ["dog waste bags near me", /dog|pet|waste/i],
    ["EV charging near me", /\bev\b|electric|charg/i],
    ["playgrounds near me", /playground|park|recreation/i],
    ["urgent care near me", /urgent|medical|hospital|clinic|walk-in/i],
  ])("does not proximity-fill %s with unrelated businesses", (query, evidence) => {
    const results = qualifiedSearchIndex(query, 8, [], {
      origin: { lng: -77.4105, lat: 39.4143 },
      municipality: "frederick",
      contextLabel: "your location",
      canShowDistance: true,
    }).results;
    const places = results.filter((result) => result.type === "place");

    expect(
      places.every((result) =>
        evidence.test(
          `${result.title} ${result.subtitle} ${result.badge ?? ""}`,
        ),
      ),
    ).toBe(true);
  });
});
