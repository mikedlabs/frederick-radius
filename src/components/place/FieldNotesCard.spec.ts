import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FieldNotesCard from "./FieldNotesCard";

describe("FieldNotesCard trust labels", () => {
  it("labels each undated row on the row itself, with no card-level summary", () => {
    const html = renderToStaticMarkup(
      createElement(FieldNotesCard, {
        slug: "averys-maryland-grille-frederick",
      }),
    );

    expect(html).toContain("Verification date not recorded");
    // The derived seal and its summary sentence are gone; each row carries
    // its own evidence instead.
    expect(html).not.toContain("SOURCED");
    expect(html).not.toContain("no recorded verification date");
  });

  it("shows each dated row's own verification date beside its source link", () => {
    const html = renderToStaticMarkup(
      createElement(FieldNotesCard, {
        slug: "belles-sports-bar-grill-frederick",
      }),
    );

    expect(html).toMatch(/<span>verified (?:just now|today|\d+d ago|\d+w ago|\d+mo ago)<\/span>/);
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("Verification date not recorded");
    expect(html).not.toContain("VERIFIED");
    expect(html).not.toContain("Every note has a recorded verification date.");
  });
});
