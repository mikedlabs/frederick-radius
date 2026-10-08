import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FieldNotesCard, { fieldNotesVerificationLine } from "./FieldNotesCard";

describe("FieldNotesCard verification line", () => {
  it("keeps the plural noun when one of several notes is undated", () => {
    expect(
      fieldNotesVerificationLine({ total: 3, undated: 1, allDated: false }),
    ).toBe("1 of 3 notes has no recorded verification date.");
  });

  it("uses a plural verb when several notes are undated", () => {
    expect(
      fieldNotesVerificationLine({ total: 3, undated: 2, allDated: false }),
    ).toBe("2 of 3 notes have no recorded verification date.");
  });

  it("describes a lone note directly instead of counting 1 of 1", () => {
    expect(
      fieldNotesVerificationLine({ total: 1, undated: 1, allDated: false }),
    ).toBe("This note has no recorded verification date.");
    expect(
      fieldNotesVerificationLine({ total: 1, undated: 0, allDated: true }),
    ).toBe("This note has a recorded verification date.");
  });

  it("keeps the every-note line for several dated notes", () => {
    expect(
      fieldNotesVerificationLine({ total: 4, undated: 0, allDated: true }),
    ).toBe("Every note has a recorded verification date.");
  });

  it("never renders a singular noun after a plural total", () => {
    for (let total = 2; total <= 6; total += 1) {
      for (let undated = 1; undated <= total; undated += 1) {
        expect(
          fieldNotesVerificationLine({ total, undated, allDated: false }),
        ).not.toMatch(/ of \d+ note /);
      }
    }
  });
});

describe("FieldNotesCard trust labels", () => {
  it("labels a mixed-date card as sourced and identifies undated rows", () => {
    const html = renderToStaticMarkup(
      createElement(FieldNotesCard, {
        slug: "averys-maryland-grille-frederick",
      }),
    );

    expect(html).toContain("SOURCED");
    expect(html).toContain("Verification date not recorded");
    expect(html).toContain("no recorded verification date");
  });

  it("uses the verified seal only when every rendered row has a date", () => {
    const html = renderToStaticMarkup(
      createElement(FieldNotesCard, {
        slug: "belles-sports-bar-grill-frederick",
      }),
    );

    expect(html).toContain("VERIFIED");
    expect(html).toContain("Every note has a recorded verification date.");
    expect(html).not.toContain("Verification date not recorded");
  });
});

describe("FieldNotesCard on paper", () => {
  it("names the region with a sentence-case section heading and no box", () => {
    const html = renderToStaticMarkup(createElement(FieldNotesCard, { slug: "cafe-nola" }));
    const open = html.match(/^<section[^>]*>/)?.[0] ?? "";

    expect(open).toContain('aria-label="Field notes"');
    expect(open).not.toContain("class=");
    expect(open).not.toContain("box-shadow");
    const heading = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? "";
    expect(heading).toContain("Field notes");
    expect(heading).not.toContain("uppercase");
    expect(heading).not.toContain("font-mono");
    expect(html).not.toContain("tracking-[0.14em]");
    expect(html).not.toMatch(/text-\[1[01](?:\.5)?px\]/);
  });
});

describe("FieldNotesCard on the place page", () => {
  it("leaves parking to the Location section when asked", () => {
    const full = renderToStaticMarkup(createElement(FieldNotesCard, { slug: "cafe-nola" }));
    const withoutParking = renderToStaticMarkup(
      createElement(FieldNotesCard, { slug: "cafe-nola", omitParking: true }),
    );

    expect(full).toContain("Carroll Creek Garage");
    expect(withoutParking).not.toContain("Carroll Creek Garage");
    expect(withoutParking).toContain("Happy hour");
    // The count in the footer describes only the rows this card prints.
    expect(full).toContain("5 of 7 notes have no recorded verification date.");
    expect(withoutParking).toContain("5 of 6 notes have no recorded verification date.");
  });
});
