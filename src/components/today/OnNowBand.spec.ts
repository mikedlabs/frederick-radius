import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { onNowMoreTitle } from "./OnNowBand";

describe("On-now band disclosure title", () => {
  it("names the one block behind the closed disclosure", () => {
    expect(onNowMoreTitle(["happy"])).toBe("Also today: happy hour");
    expect(onNowMoreTitle(["parking"])).toBe("Also today: event parking");
  });

  it("never shares a name with the block it holds, so two regions and headings never read the same", () => {
    // HappyHourWallet is its own region headed "Happy hour".
    for (const key of ["happy", "deals", "markets", "parking"] as const) {
      expect(onNowMoreTitle([key])).not.toMatch(/^(Happy hour|Specials|Farmers markets|Event parking)$/i);
    }
  });

  it("names every hidden block in the order the band shows them", () => {
    expect(onNowMoreTitle(["happy", "parking"])).toBe("Also today: happy hour and event parking");
    expect(onNowMoreTitle(["deals", "happy", "markets"])).toBe("Also today: specials, happy hour and farmers markets");
  });

  it("never falls back to a count of layout sections", () => {
    const source = readFileSync(new URL("./OnNowBand.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/Other scheduled updates|countLabel=/);
    // Saved open and closed choices keep working under the same key.
    expect(source).toContain('storageKey="fr.today.on-now-more"');
  });
});
