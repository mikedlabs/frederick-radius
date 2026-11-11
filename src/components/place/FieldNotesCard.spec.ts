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
    // The fixture place's field notes hold five dated rows.
    const ROWS = 5;
    const html = renderToStaticMarkup(
      createElement(FieldNotesCard, {
        slug: "belles-sports-bar-grill-frederick",
      }),
    );

    // Every row carries its own date and its own source link.
    const dates = html.match(/<span>verified (?:just now|today|\d+d ago|\d+w ago|\d+mo ago)<\/span>/g) ?? [];
    const links = html.match(/target="_blank"/g) ?? [];
    expect(dates).toHaveLength(ROWS);
    expect(links).toHaveLength(ROWS);
    expect(html).not.toContain("Verification date not recorded");
    expect(html).not.toContain("VERIFIED");
    expect(html).not.toContain("Every note has a recorded verification date.");
  });
});
