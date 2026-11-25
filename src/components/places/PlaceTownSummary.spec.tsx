import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COLLECTION_BY_SLUG } from "@/data/collections";
import FindStart from "@/components/search/FindStart";
import PlaceTownSummary, { countPlaceTowns } from "./PlaceTownSummary";

describe("local discovery visuals", () => {
  it("uses named photographs of places actually included in the two county guides", () => {
    expect(COLLECTION_BY_SLUG["kid-energy-burners"].places).toContain("sophie-madigans-playground-frederick");
    expect(COLLECTION_BY_SLUG["walkable-date-night"].places).toContain("carroll-creek-linear-park-frederick");
    const html = renderToStaticMarkup(<FindStart town={null} />);
    expect(html.match(/data-discovery-photo/g)).toHaveLength(2);
    expect(html).toContain("Carroll Creek Linear Park");
    expect(html).toContain('href="/nearby?c=coffee&amp;in=county"');
  });

  it("marks the selected town, keeps the category link scoped, and leaves out a different town's photographs", () => {
    const html = renderToStaticMarkup(<FindStart town="thurmont" />);
    expect(html).toContain("Town center: Thurmont");
    expect(html).toContain('href="/nearby?c=coffee&amp;in=thurmont"');
    expect(html).not.toContain("data-discovery-photo");
  });

  it("retains a Near me handoff without implying that the two city examples are near the visitor", () => {
    const html = renderToStaticMarkup(<FindStart town={null} nearMe />);
    expect(html).toContain('href="/nearby?c=coffee&amp;in=nearme"');
    expect(html).not.toContain("data-discovery-photo");
  });

  it("labels counts from the supplied results and retains records with an unlisted town", () => {
    const places = ["frederick", "brunswick", "frederick", "unlisted"].map(municipality => ({ municipality }));
    const html = renderToStaticMarkup(<PlaceTownSummary tally={countPlaceTowns(places)} label="Towns in these results" />);
    expect(html).toContain("Towns in these results");
    expect(html).toContain("Frederick City <strong>2</strong>");
    expect(html).toContain("Brunswick <strong>1</strong>");
    expect(html).toContain("Town not listed <strong>1</strong>");
    expect(renderToStaticMarkup(<PlaceTownSummary tally={new Map([["brunswick", 3]])} label="Towns" />)).toBe("");
  });
});
