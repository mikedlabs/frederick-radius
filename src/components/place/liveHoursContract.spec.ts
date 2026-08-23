import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheet = readFileSync("src/components/place/PlaceSheet.tsx", "utf8");
const page = readFileSync("src/app/(app)/places/[slug]/page.tsx", "utf8");

describe("current place-hours surfaces", () => {
  it("checks an opened unverified place even when media or contact data exists", () => {
    expect(sheet).toContain(': !place.hours_verified\n      ? "hours"');
    expect(sheet).toContain("effectiveOpenStatus = extra?.open_status ?? place.open_status");
    expect(sheet).toContain("<OpenClosedDot status={effectiveOpenStatus} />");
    expect(sheet).toContain("placeHoursTrust(effectiveOpenStatus)");
    expect(sheet).toContain("subject={effectiveHoursCheckedAt ? \"Hours\" : \"Listing\"}");
  });

  it("shares current hours between a full page's hero and schedule", () => {
    expect(page).toContain("<LiveOpenStatus");
    expect(page).toContain("slug={place.slug}");
    expect(page).toContain("<LiveHoursBlock");
  });
});
