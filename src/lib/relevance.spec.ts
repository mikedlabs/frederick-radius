import { describe, expect, it } from "vitest";
import {
  isRecommendable,
  isRestrictedMembershipVenue,
} from "./relevance";

describe("restricted membership venue recommendation gate", () => {
  it.each([
    "Fraternal Order of Eagles 4",
    "Eagles Aerie 1067",
    "Elks Lodge 684",
    "American Legion Post 11",
    "V.F.W. Post 3285",
  ])("recognizes %s as a membership venue", (name) => {
    expect(isRestrictedMembershipVenue(name)).toBe(true);
    expect(
      isRecommendable({
        name,
        primary_type: "bar",
        source: "manual",
        slug: name.toLowerCase().replaceAll(" ", "-"),
      }),
    ).toBe(false);
  });

  it("does not suppress an ordinary public venue with a similar word", () => {
    expect(isRestrictedMembershipVenue("Eagles & Orioles at Nymeo Field")).toBe(false);
    expect(
      isRecommendable({
        name: "Eagles & Orioles at Nymeo Field",
        primary_type: "stadium",
        source: "manual",
        slug: "eagles-and-orioles",
      }),
    ).toBe(true);
  });

  it("keeps the existing institutional gate intact", () => {
    expect(
      isRecommendable({
        name: "Example Elementary School",
        primary_type: "primary_school",
        source: "google",
        slug: "example-elementary-school",
      }),
    ).toBe(false);
  });
});
