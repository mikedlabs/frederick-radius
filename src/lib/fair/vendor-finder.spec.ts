import { describe, expect, it } from "vitest";

import {
  GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY,
  fairVendorDirectoryHref,
} from "./vendor-finder";

describe("fairVendorDirectoryHref", () => {
  it("keeps Fair vendor lookups in the organizer's live directory", () => {
    expect(fairVendorDirectoryHref("White Rabbit")).toBe(
      "https://mobile.eventhub-floorplan.net/exhibitors-g2app.php?Show_ID=18209&q=White+Rabbit",
    );
  });

  it("offers the organizer's directory without treating it as Radius map data", () => {
    expect(fairVendorDirectoryHref()).toBe(
      "https://mobile.eventhub-floorplan.net/exhibitors-g2app.php?Show_ID=18209",
    );
    expect(GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY.sourceUrl).toBe(
      "https://thegreatfrederickfair.com/vendors/",
    );
  });

  it("keeps the searchable handoff on the Fair-published EventHub guide", () => {
    const guide = new URL(
      GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY.guideUrl,
    );
    const directory = new URL(
      GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY.directoryUrl,
    );

    expect(directory.hostname).toBe(guide.hostname);
    expect(guide.searchParams.get("Show_ID")).toBe(
      GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY.showId,
    );
  });
});
