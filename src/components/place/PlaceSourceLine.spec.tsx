import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceSourceLine from "./PlaceSourceLine";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };

// The provenance fields of Wag's Restaurant as decorated on 2026-11-11.
const wags = {
  slug: "wags-restaurant", name: "Wag's Restaurant", source: "dfp", is_verified: true, google_verified: true,
  hours_source: "google_places", hours_updated_at: "2026-08-22T08:01:01.244Z",
  last_verified_at: "2026-05-20T16:12:54.399Z", updated_at: "2026-05-14",
} as unknown as PlaceCardData;

function line(place: PlaceCardData, children?: string) {
  const doc = new JSDOM(renderToStaticMarkup(<PlaceSourceLine place={place}>{children}</PlaceSourceLine>)).window.document;
  return doc.querySelector("[data-place-source-line]")!;
}

describe("PlaceSourceLine", () => {
  it("collects the source tier, the Google match, the listing check and the record's own update", () => {
    const el = line(wags);
    expect(el.textContent).toContain("Checked at source");
    expect(el.textContent).toContain("Confirmed by Google");
    // FreshnessChip fills the listing slot after hydration. The record's own
    // update names a different day, so it stays, labeled as what it dates.
    expect(el.children).toHaveLength(4);
    expect(el.children[2].textContent).toBe("");
    expect(el.children[2].className).toContain("empty:hidden");
    expect(el.children[3].textContent).toBe("Updated on May 14");
  });

  it("prints the record's update only once when it names the listing check's day", () => {
    const el = line({ ...wags, updated_at: "2026-05-20" } as unknown as PlaceCardData);
    expect(el.textContent).not.toContain("Updated");
  });

  it("falls back to the record's update date only when no listing check exists", () => {
    const el = line({ ...wags, last_verified_at: undefined } as unknown as PlaceCardData);
    expect(el.textContent).toContain("Updated on May 14");
  });

  it("drops the Google match for first-party hours and keeps the reviewed tier", () => {
    const el = line({ ...wags, source: "seed", hours_source: "first_party" } as PlaceCardData);
    expect(el.textContent).toContain("Radius reviewed");
    expect(el.textContent).not.toContain("Confirmed by Google");
  });

  it("carries trailing items, such as the sheet's correction link, on the same line", () => {
    const el = line(wags, "See something wrong?");
    expect(el.lastElementChild?.textContent).toBe("See something wrong?");
  });
});
