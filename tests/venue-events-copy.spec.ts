import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import venueEvents from "../src/data/venue-events.json";
import { lintSourceText } from "../scripts/style-lint";

type VenueEventCopy = {
  title: string;
  description?: string;
  description_origin?: string;
};

const DESCRIPTION_ORIGINS = new Set(["source-excerpt", "radius-summary"]);
const SOURCE_INVENTORY = resolve(
  "src/data/venue-event-source-inventory.json",
);

function descriptionsWithInvalidOrigin(events: VenueEventCopy[]) {
  return events.filter(
    (event) => event.description && !DESCRIPTION_ORIGINS.has(event.description_origin ?? ""),
  );
}

function lintRadiusSummaries(events: VenueEventCopy[]) {
  return events.flatMap((event) => {
    if (!event.description || event.description_origin !== "radius-summary") return [];
    return lintSourceText(
      "src/data/venue-event-summary.json",
      JSON.stringify({ description: event.description }),
    ).map((finding) => ({ title: event.title, ...finding }));
  });
}

describe("venue event copy provenance", () => {
  // Automated venue runs write the recoverable source inventory before these
  // checks execute. Validate that full inventory, including a currently hidden
  // duplicate; fall back to the public artifact before the migration's first
  // run or in an older checkout.
  const events = existsSync(SOURCE_INVENTORY)
    ? JSON.parse(readFileSync(SOURCE_INVENTORY, "utf8")) as VenueEventCopy[]
    : venueEvents as VenueEventCopy[];

  it("marks every committed description with a recognized origin", () => {
    expect(descriptionsWithInvalidOrigin(events)).toEqual([]);
  });

  it("rejects a misspelled origin instead of silently skipping voice checks", () => {
    expect(
      descriptionsWithInvalidOrigin([{
        title: "Mistyped provenance",
        description: "This is a Radius summary.",
        description_origin: "radius-sumary",
      }]),
    ).toHaveLength(1);
  });

  it("applies Radius voice rules only to Radius summaries", () => {
    expect(lintRadiusSummaries(events)).toEqual([]);
  });

  it("does not rewrite publisher excerpts to satisfy Radius voice rules", () => {
    const publisherCopy: VenueEventCopy = {
      title: "Publisher title",
      description: "A vibrant night. Big sound. Great crowd.",
      description_origin: "source-excerpt",
    };

    expect(lintRadiusSummaries([publisherCopy])).toEqual([]);
  });
});
