import { describe, expect, it } from "vitest";
import { matchDepartment } from "@/data/department-contacts";

describe("matchDepartment jurisdiction routing", () => {
  it("uses the City of Frederick office for a city public-works request", () => {
    expect(matchDepartment("Who handles city public works?")?.slug).toBe("city-public-works");
  });

  it("uses the county office when county is explicit", () => {
    expect(matchDepartment("Frederick County public works phone")?.slug).toBe("public-works");
  });

  it("uses location context to resolve an otherwise ambiguous office", () => {
    expect(matchDepartment("Who do I call about a pothole?", { municipality: "frederick" })?.slug).toBe("city-public-works");
  });

  it("does not send another town to a City of Frederick department", () => {
    expect(matchDepartment("public works", { municipality: "brunswick" })?.jurisdiction).toBe("county");
  });

  it("still finds a countywide service from city context when there is no city equivalent", () => {
    expect(matchDepartment("animal control", { municipality: "frederick" })?.slug).toBe("animal-control");
  });
});
