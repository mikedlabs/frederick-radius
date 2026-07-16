import { describe, expect, it } from "vitest";
import { filterCitedSources, sourceIsCited } from "@/lib/ask/citations";

const sources = [
  { slug: "alley-nights", name: "Alley Nights" },
  { slug: "funeral-home", name: "Stauffer Funeral Home" },
  { slug: "county-budget", name: "County budget" },
];

describe("Ask source citations", () => {
  it("keeps only the source explicitly cited by the answer", () => {
    const answer = "Alley Nights at Brewer's Alley is the strongest fit for something fun tomorrow night.";
    expect(filterCitedSources(sources, answer).map((source) => source.slug)).toEqual(["alley-nights"]);
  });

  it("does not treat generic location words as a citation", () => {
    const answer = "Here is one option in Frederick County for tomorrow night.";
    expect(filterCitedSources(sources, answer)).toEqual([]);
  });

  it("recognizes a shortened compound event title without accepting unrelated cards", () => {
    expect(sourceIsCited({ name: "Alive @ Five · La Unica" }, "Alive at Five is tonight downtown.")).toBe(true);
    expect(sourceIsCited({ name: "County budget" }, "Dinner in Frederick County sounds good.")).toBe(false);
  });

  it("drops the unrelated cards seen under the steak reservation answer", () => {
    const noisy = [
      { slug: "property-zoning", name: "Property zoning" },
      { slug: "dcfs-family-support-specialist", name: "DCFS Family Support Specialist" },
      { slug: "freddie-long", name: "Freddie Long at Monocacy Crossing" },
    ];
    const answer = "Avery's Maryland Grille is the verified steak match. Check OpenTable for 7:30 PM.";
    expect(filterCitedSources(noisy, answer)).toEqual([]);
  });
});
