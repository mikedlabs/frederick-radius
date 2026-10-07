import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HappyHourWallet from "./HappyHourWallet";

// A fixed venue and pour so the type floor does not depend on which happy
// hours the live Field Notes file happens to hold this week.
vi.mock("@/lib/loaders/fieldNotes", () => ({
  placesWithFieldHappyHour: () => [
    {
      slug: "late-pour",
      happy_hour: {
        schedule: "Daily 9 PM-close",
        details: "$5 house cocktails",
      },
    },
  ],
}));
vi.mock("@/lib/loaders/places-client", () => ({
  clientPlaceBySlug: (slug: string) =>
    slug === "late-pour"
      ? {
          slug,
          name: "Late Pour",
          category: "bar",
          municipality: "frederick",
          google_rating: 4.5,
        }
      : undefined,
}));

describe("HappyHourWallet", () => {
  it("prints the live window at the 11px floor in sentence case", () => {
    // Tuesday, Oct 6, 10:55 PM Eastern.
    const html = renderToStaticMarkup(
      <HappyHourWallet now={new Date("2026-10-07T02:55:00.000Z")} />,
    );

    const badge = html.match(/<span class="[^"]*rounded-full[^"]*"[^>]*>[\s\S]*?On now · till close<\/span>/)?.[0];
    expect(badge).toBeDefined();
    expect(badge).toContain("text-[11px]");
    expect(badge).not.toContain("uppercase");
    expect(html).toContain("1 deal available now");
    expect(html).not.toMatch(/text-\[(?:\d|10)(?:\.\d+)?px\]/);
  });

  it("keeps the between-rounds label at the 11px floor", () => {
    // Tuesday, Oct 6, 6 PM Eastern: the next pour starts at 9 PM.
    const html = renderToStaticMarkup(
      <HappyHourWallet now={new Date("2026-10-06T22:00:00.000Z")} />,
    );

    expect(html).toContain("Between rounds");
    expect(html).toContain("Opens 9 PM");
    expect(html).not.toMatch(/text-\[(?:\d|10)(?:\.\d+)?px\]/);
  });
});
