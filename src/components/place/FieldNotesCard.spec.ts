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
