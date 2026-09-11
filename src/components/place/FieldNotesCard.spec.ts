import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FieldNotesCard from "./FieldNotesCard";

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
