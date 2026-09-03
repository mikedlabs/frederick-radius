import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  crossSourceScheduleConflicts,
  FAIR_SOURCE_REDIRECT_POLICY,
} from "../scripts/collect-fair-data";
import { parseOfficialFairPages } from "../src/lib/fair/data-candidate";
import { parseGreatFrederickFair2026Schedule } from "../src/lib/fair/schedule";

const schedule = parseGreatFrederickFair2026Schedule(
  readFileSync(
    new URL(
      "../src/lib/fair/__fixtures__/great-frederick-fair-2026.ics",
      import.meta.url,
    ),
    "utf8",
  ),
);

function page(id: number, slug: string, content: string) {
  return {
    id,
    slug,
    modified_gmt: "2026-09-02T12:00:00",
    link: `https://thegreatfrederickfair.com/${slug}/`,
    title: { rendered: slug },
    content: { rendered: `<p>${content}</p>` },
  };
}

describe("Fair data collector review gates", () => {
  it("refuses source redirects before a NAS request can leave the allowlist", () => {
    expect(FAIR_SOURCE_REDIRECT_POLICY).toBe("error");
  });

  it("surfaces known conflicts between current official schedule sources", () => {
    const pages = parseOfficialFairPages(
      JSON.stringify([
        page(
          3224,
          "schedule",
          "POP 2000 with Chris Kirkpatrick. Warren Zeiders with Chris Darlington. PeeWee &amp; Open Class Dairy Showmanship. Mark&#8217;s Equipment.",
        ),
        page(
          3262,
          "grandstand",
          "POP 2000 with Jeff Timmons. Warren Zeiders with Chris Darlington.",
        ),
      ]),
      [3224, 3262],
    );

    expect(
      crossSourceScheduleConflicts(schedule, pages).map((item) => item.id),
    ).toEqual([
      "pop-2000-performer",
      "warren-zeiders-opener",
      "peewee-dairy-row",
      "equipment-source-encoding",
    ]);
  });

  it("does not create a conflict from unrelated page copy", () => {
    const pages = parseOfficialFairPages(
      JSON.stringify([
        page(3224, "schedule", "The Fair runs for nine days."),
        page(3262, "grandstand", "See the current ticket page."),
      ]),
      [3224, 3262],
    );

    expect(crossSourceScheduleConflicts(schedule, pages)).toEqual([
      expect.objectContaining({ id: "equipment-source-encoding" }),
    ]);
  });
});
