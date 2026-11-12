import { describe, expect, it } from "vitest";

import { appMainModeForPath } from "./AppMain";

describe("AppMain route mode", () => {
  it("gives the browse map the full-bleed canvas", () => {
    expect(appMainModeForPath("/map")).toBe("full-bleed");
  });

  it("keeps the reading column everywhere else", () => {
    expect(appMainModeForPath("/today")).toBe("reading");
    expect(appMainModeForPath("/moments/in-the-street-2026")).toBe("reading");
    expect(appMainModeForPath("/fair")).toBe("reading");
  });
});
