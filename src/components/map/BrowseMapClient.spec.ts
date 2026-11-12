import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/map/AppMapClient", () => ({ default: () => null }));

import { mapArrivalCarriesExplicitView } from "./BrowseMapClient";

const carries = (search: string) => mapArrivalCarriesExplicitView(new URLSearchParams(search));

describe("mapArrivalCarriesExplicitView", () => {
  it("lets the smart default speak on a clean arrival", () => {
    expect(carries("")).toBe(false);
  });
  it("stays silent when the URL already chose a view", () => {
    expect(carries("?intent=eat")).toBe(true);
    expect(carries("?q=")).toBe(true);
    expect(carries("?c=-77.41,39.41,13")).toBe(true);
  });
  it("counts a place or event only when it names an entity", () => {
    expect(carries("?place=brewers-alley-frederick")).toBe(true);
    expect(carries("?event=fall-festival")).toBe(true);
    expect(carries("?place=")).toBe(false);
    expect(carries("?event=&place=%20")).toBe(false);
  });
});
