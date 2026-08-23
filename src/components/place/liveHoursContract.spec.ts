import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheet = readFileSync("src/components/place/PlaceSheet.tsx", "utf8");
const page = readFileSync("src/app/(app)/places/[slug]/page.tsx", "utf8");
const heroStatus = readFileSync(
  "src/components/place/LiveOpenStatus.tsx",
  "utf8",
);
const hoursBlock = readFileSync(
  "src/components/place/LiveHoursBlock.tsx",
  "utf8",
);

describe("current place-hours surfaces", () => {
  it("never spends on current hours merely because a place surface opened", () => {
    expect(sheet).not.toContain("automaticEnrichmentMode");
    expect(heroStatus).not.toContain("loadLivePlaceHours");
    expect(hoursBlock).not.toContain("loadLivePlaceHours(slug);\n");
  });

  it("offers a clear user-triggered current-hours check", () => {
    expect(sheet).toContain("loadLivePlaceHours(place.slug)");
    expect(sheet).toContain('"Check current hours"');
    expect(hoursBlock).toContain("onClick={checkCurrentHours}");
    expect(hoursBlock).toContain('"Check current hours"');
    expect(sheet).toContain("effectiveOpenStatus = extra?.open_status ?? place.open_status");
    expect(sheet).toContain("<OpenClosedDot status={effectiveOpenStatus} />");
    expect(sheet).toContain("placeHoursTrust(effectiveOpenStatus)");
    expect(sheet).toContain("subject={effectiveHoursCheckedAt ? \"Hours\" : \"Listing\"}");
  });

  it("shares user-requested current hours between a full page's hero and schedule", () => {
    expect(page).toContain("<LiveOpenStatus");
    expect(page).toContain("slug={place.slug}");
    expect(page).toContain("<LiveHoursBlock");
    expect(heroStatus).toContain("subscribeLivePlaceHours");
    expect(hoursBlock).toContain("subscribeLivePlaceHours");
  });
});
