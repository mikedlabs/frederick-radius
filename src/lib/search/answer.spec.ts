import { describe, it, expect } from "vitest";
import { primaryAnswerFor, simpleCategoryRequestQuery } from "./answer";
import { readNearbyQuery } from "@/lib/nearby-query";

describe("primaryAnswerFor", () => {
  it("offers the coffee browse surface without promising every result is open", () => {
    const a = primaryAnswerFor("coffee open now near me");
    expect(a?.key).toBe("coffee");
    expect(a?.href).toBe("/nearby?c=coffee");
    expect(a?.kicker).toBe("Browse local places; nearest when location is available");
  });

  it("resolves specific terms before the broad buckets", () => {
    expect(primaryAnswerFor("where can I get a beer")?.key).toBe("breweries");
    expect(primaryAnswerFor("pizza")?.key).toBe("food");
    expect(primaryAnswerFor("wineries near me")?.key).toBe("wineries");
    expect(primaryAnswerFor("a good hike")?.key).toBe("outside");
  });

  it.each(["pizza", "pizzeria", "I need pizza"])("retains the requested pizza filter for %s", query => {
    const answer = primaryAnswerFor(query, { municipality: "brunswick" });
    expect(answer).toMatchObject({ key: "food", label: "Pizza", href: "/nearby?c=food&facet=pizza&in=brunswick" });
    expect(readNearbyQuery(new URL(answer!.href, "https://radius.test").searchParams))
      .toMatchObject({ cravingKey: "food", facetKey: "pizza", scope: "town:brunswick" });
  });

  it("retains a named town in the category destination", () => {
    expect(primaryAnswerFor("coffee in Brunswick", { municipality: "frederick" })).toMatchObject({
      href: "/nearby?c=coffee&in=brunswick",
      kicker: "Browse coffee in Brunswick.",
    });
    expect(primaryAnswerFor("coffee", { municipality: "thurmont" })?.href).toBe("/nearby?c=coffee&in=thurmont");
  });

  it("answers a bare open query with Open now", () => {
    const a = primaryAnswerFor("what's open right now");
    expect(a?.key).toBe("open-now");
    expect(a?.href).toBe("/open-now");
    expect(a?.kicker).toBe(
      "See confirmed-open places across the county.",
    );
  });

  it("does not treat 'open mic' as an open-now query", () => {
    // 'open mic' is a live-music term, and the open-now guard excludes it.
    expect(primaryAnswerFor("open mic tonight")?.key).toBe("music");
  });

  it("returns null when nothing intent-like matches", () => {
    expect(primaryAnswerFor("zzxq")).toBeNull();
    expect(primaryAnswerFor("a")).toBeNull();
  });

  it("does not mistake automotive service language for retail shopping", () => {
    expect(primaryAnswerFor("nearest auto repair shop")).toBeNull();
    expect(primaryAnswerFor("car wash near me")).toBeNull();
    expect(primaryAnswerFor("oil change")).toBeNull();
  });
});


describe("simple category request vocabulary", () => {
  it.each([
    ["I need pizza", "pizza"], ["  I WANT   COFFEE?  ", "coffee"],
    ["pizza?", "pizza"], ["coffee?", "coffee"], ["museums?", "museums"],
    ["I’m looking for a museum", "museum"], ["I am looking for some ice cream?", "ice cream"],
  ])("unwraps only the complete bare category in %s", (query, category) => {
    expect(simpleCategoryRequestQuery(query)).toBe(category);
  });
  it.each([
    "I need coffee and bikes", "I want coffee near me", "I need coffee open tonight",
    "I need wheelchair accessible coffee", "I need a quiet museum", "I need pizza in Brunswick",
    "I need pizza without cheese", "I want happy hour", "I need overnight", "I want live music",
    "I need family friendly", "I need pizza? and coffee", "coffee", "I need zzxq",
    "pizza open tonight?", "coffee and bikes?", "wheelchair accessible coffee?", "I need sauna",
  ])("does not swallow constraints or unknown terms in %s", query => {
    expect(simpleCategoryRequestQuery(query)).toBeNull();
  });
});
