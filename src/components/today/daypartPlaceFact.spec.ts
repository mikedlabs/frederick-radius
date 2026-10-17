import { describe, expect, it } from "vitest";
import {
  daypartOpeningTime,
  daypartPlaceFact,
  isConfirmedOpeningSoon,
} from "./daypartPlaceFact";

describe("daypartPlaceFact", () => {
  it("prints confirmed opening times in the site clock format", () => {
    expect(daypartOpeningTime("Opens soon · 4pm")).toBe("4pm");
    expect(daypartPlaceFact({
      confidence: "confirmed",
      fact: "Opens soon · 4pm",
    })).toBe("Opens 4pm");
    expect(daypartPlaceFact({
      confidence: "confirmed",
      fact: "Opens at 9am.",
    })).toBe("Opens 9am");
    expect(isConfirmedOpeningSoon({
      slug: "hootch",
      name: "Hootch & Banter",
      rating: 4.5,
      confidence: "confirmed",
      fact: "Opens soon · 4pm",
    })).toBe(true);
  });

  it("does not guess a time when hours are not confirmed", () => {
    expect(daypartPlaceFact({
      confidence: "likely",
      fact: "Likely opens at 4pm · check hours",
    })).toBe("Hours not confirmed");
    expect(daypartPlaceFact({
      confidence: "likely",
      fact: "Likely open · check hours",
    })).toBe("Hours not confirmed");
    expect(daypartPlaceFact({
      confidence: "unconfirmed",
      fact: "Hours are not confirmed.",
    })).toBe("Hours not confirmed");
    expect(isConfirmedOpeningSoon({
      slug: "hootch",
      name: "Hootch & Banter",
      rating: 4.5,
      confidence: "likely",
      fact: "Likely opens at 4pm · check hours",
    })).toBe(false);
  });
});
