import { describe, expect, it } from "vitest";
import { isDepartmentRequest, matchDepartment } from "./department-contacts";

describe("department matching", () => {
  it("does not turn ordinary and-queries into county departments", () => {
    for (const query of [
      "beer and food tonight",
      "dinner and a show",
      "coffee and pastries",
      "a quiet coffee and a walk",
      "something for my family and friends",
    ]) {
      expect(isDepartmentRequest(query)).toBe(false);
      expect(matchDepartment(query)).toBeNull();
    }
  });

  it("still routes clear civic contact requests", () => {
    expect(matchDepartment("Who do I call about animal control?")?.slug).toBe("animal-control");
    expect(matchDepartment("What department handles potholes?")?.slug).toMatch(/public-works/);
  });
});
