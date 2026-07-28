import { describe, expect, it } from "vitest";
import { decoratePlace, publicPlaceBySlug } from "./places";

describe("place blurb boundary", () => {
  it("keeps the place-name subject in a complete sentence", () => {
    const bakerPark = publicPlaceBySlug("baker-park-frederick");
    expect(bakerPark).toBeDefined();

    const rendered = decoratePlace(bakerPark!);
    expect(rendered.short_blurb).toBe(
      "Baker Park is a 44-acre downtown park with a band shell, lake, tennis, and the Joseph D. Baker carillon tower.",
    );
  });

  it("never exposes a subjectless lower-case remainder", () => {
    const bakerPark = publicPlaceBySlug("baker-park-frederick");
    expect(bakerPark).toBeDefined();

    const rendered = decoratePlace({
      ...bakerPark!,
      slug: "fixture-subjectless-blurb",
      name: "Fixture Place",
      short_blurb: "Fixture Place general information near downtown.",
    });
    expect(rendered.short_blurb).toBe("");
  });

  it("drops a source excerpt that ends mid-sentence", () => {
    const bakerPark = publicPlaceBySlug("baker-park-frederick");
    expect(bakerPark).toBeDefined();

    const rendered = decoratePlace({
      ...bakerPark!,
      slug: "fixture-truncated-blurb",
      name: "Fixture Place",
      short_blurb: "This source excerpt stops before it is",
    });
    expect(rendered.short_blurb).toBe("");
  });

  it("finishes a complete source clause that only lacks final punctuation", () => {
    const bakerPark = publicPlaceBySlug("baker-park-frederick");
    expect(bakerPark).toBeDefined();

    const rendered = decoratePlace({
      ...bakerPark!,
      slug: "fixture-complete-unpunctuated-blurb",
      name: "Fixture Place",
      short_blurb: "Fixture Place hosts monthly exhibitions and artist talks",
    });
    expect(rendered.short_blurb).toBe(
      "Fixture Place hosts monthly exhibitions and artist talks.",
    );
  });

  it("drops a clause with a finite verb when its ending is still truncated", () => {
    const bakerPark = publicPlaceBySlug("baker-park-frederick");
    expect(bakerPark).toBeDefined();

    const rendered = decoratePlace({
      ...bakerPark!,
      slug: "fixture-dangling-blurb",
      name: "Fixture Place",
      short_blurb: "Fixture Place hosts monthly exhibitions and works with",
    });
    expect(rendered.short_blurb).toBe("");
  });

  it("does not turn a noun phrase into a sentence by adding a period", () => {
    const bakerPark = publicPlaceBySlug("baker-park-frederick");
    expect(bakerPark).toBeDefined();

    const rendered = decoratePlace({
      ...bakerPark!,
      slug: "fixture-noun-phrase-blurb",
      name: "Fixture Place",
      short_blurb: "Fixture Place monthly exhibitions and artist talks",
    });
    expect(rendered.short_blurb).toBe("");
  });

  it("loads an approved first-party description with provenance", () => {
    const dublin = publicPlaceBySlug("dublin-roasters-frederick");
    expect(dublin).toBeDefined();

    const rendered = decoratePlace(dublin!);
    expect(rendered.short_blurb).toContain("air roasting");
    expect(rendered.description_source).toBe("business_website");
    expect(rendered.description_source_url).toBe("https://dublinroasterscoffee.com/");
    expect(rendered.description_reviewed).toBe(true);
  });

  it("replaces Cafe Nola's low-information directory scrape", () => {
    const cafeNola = publicPlaceBySlug("cafe-nola");
    expect(cafeNola).toBeDefined();

    const rendered = decoratePlace(cafeNola!);
    expect(rendered.short_blurb).toBe(
      "Cafe Nola is a cafe and bar on East Patrick Street with pickup ordering.",
    );
    expect(rendered.short_blurb).not.toContain("sometimes open");
    expect(rendered.description_source).toBe("business_website");
    expect(rendered.description_reviewed).toBe(true);
  });
});
