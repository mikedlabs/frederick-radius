import { describe, it, expect } from "vitest";
import { classifyCivicPress } from "@/lib/integrations/civic-press";

// Real titles pulled from the City + County CivicPlus News Flash feeds.
// The classifier is the load-bearing logic for the /pulse breaking strip:
// it must catch police releases and must NOT mislabel a holiday-closure
// notice as an urgent advisory.
describe("classifyCivicPress lanes", () => {
  describe("police lane", () => {
    it("catches a City PD arrest release", () => {
      expect(
        classifyCivicPress("Frederick Police Makes Arrest Following Traffic Stop, Vehicle Flight, and Foot Pursuit"),
      ).toBe("police");
    });

    it("catches a multi-suspect arrest", () => {
      expect(classifyCivicPress("Frederick Police Arrest Two-Armed Subjects on Traffic Stop")).toBe("police");
    });

    it("catches a Sheriff's Office release", () => {
      expect(classifyCivicPress("Sheriff's Office Investigating Fatal Crash on Route 15")).toBe("police");
    });

    it("catches a missing-person notice", () => {
      expect(classifyCivicPress("Deputies Searching for Missing Person Last Seen in Thurmont")).toBe("police");
    });
  });

  describe("advisory lane", () => {
    it("catches a traffic advisory", () => {
      expect(classifyCivicPress("Traffic Advisory: East Street Road Closure")).toBe("advisory");
    });

    it("catches a temporary road closure", () => {
      expect(classifyCivicPress("Shookstown Road to be Temporarily Closed Beginning July 6")).toBe("advisory");
    });

    it("catches a boil-water notice", () => {
      expect(classifyCivicPress("Boil Water Advisory Issued for Part of Walkersville")).toBe("advisory");
    });
  });

  describe("does NOT over-trigger", () => {
    it("treats a holiday office closure as civic, not advisory", () => {
      expect(classifyCivicPress("City Offices Closed and Service Schedules Adjusted for Juneteenth")).toBe("civic");
      expect(classifyCivicPress("Frederick County Government Offices Closed for Juneteenth")).toBe("civic");
    });

    it("treats ordinary civic news as civic", () => {
      expect(classifyCivicPress("Frederick County ENOUGH Initiative Hosts Food Expo")).toBe("civic");
      expect(classifyCivicPress("City of Frederick to Host Job Fair on June 9")).toBe("civic");
    });

    it("a road REOPENING is civic, not an urgent advisory", () => {
      // "Reopens" carries no closure/advisory keyword, so it should not alarm.
      expect(classifyCivicPress("New Design Road Reopens")).toBe("civic");
    });
  });
});
