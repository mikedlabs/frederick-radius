import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sports page navigation", () => {
  const source = readFileSync("src/app/(app)/sports/page.tsx", "utf8");

  it("does not repeat the sports calendar action above the schedule", () => {
    expect(source.match(/href="\/api\/calendar\/sports\.ics"/g) ?? []).toHaveLength(0);
    expect(source).toContain('<SectionHeading title="Upcoming team games" />');
  });

  it("hides the score card link back to the page the user is already on", () => {
    expect(source).toContain("<KeysScore showMoreLink={false} />");
  });
});
