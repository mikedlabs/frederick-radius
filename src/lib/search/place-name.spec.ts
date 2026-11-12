import { describe, expect, it } from "vitest";
import { isExactPlaceNameQuery } from "./place-name";

describe("complete canonical place identity", () => {
  it.each([
    ["  NATIONAL MUSEUM OF CIVIL WAR MEDICINE  ", "National Museum of Civil War Medicine"],
    ["bushwallers irish pub", "Bushwaller’s Irish Pub"],
    ["cafe nola", "Café Nola"],
    ["C & O Canal Lock 30", "C&O Canal Lock 30"],
  ])("normalizes typography in %s", (query, name) => {
    expect(isExactPlaceNameQuery(query, name)).toBe(true);
  });

  it.each(["Museum", "National Museum", "National Museum of Civil War Medicine open now", "", "!!!"])("does not call %s the complete museum name", (query) => {
    expect(isExactPlaceNameQuery(query, "National Museum of Civil War Medicine")).toBe(false);
  });
});
