// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";

vi.mock("./PlaceSheetProvider", () => ({
  usePlaceSheet: () => ({ openSheet: vi.fn() }),
}));
vi.mock("@/components/saved/SaveButton", () => ({
  default: ({ label }: { label: string }) => (
    <button type="button" aria-label={label} data-save-button />
  ),
}));
// A two-place hue table stands in for the 1,287-place build artifact.
vi.mock("@/data/place-hues.json", () => ({
  default: { "black-hog-bbq-bar": "#3684E2", "print-shop": "#B97E55" },
}));

import PlaceCard from "./PlaceCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const PROXY = "/api/place-photo?name=places%2Fhog%2Fphotos%2Fone&w=800";

function place(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: "black-hog-bbq-bar",
    name: "Black Hog BBQ Bar",
    category: "restaurant",
    primary_type: "barbecue_restaurant",
    municipality: "frederick",
    address: "118 S Market St, Frederick, MD 21701",
    city: "Frederick",
    geom: { lat: 39.9, lng: -77.9 },
    tags: [],
    // A scraped DFP blurb: it must never reach a row.
    short_blurb: "Black Hog BBQ Bar Smoked meats and craft beer in a lively room downtown every night.",
    open_status: { state: "unknown" },
    ...overrides,
  } as PlaceCardData;
}

/** Let the hue table's dynamic import resolve and re-render. */
async function flushHues() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("PlaceCard picture row", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = async (node: React.ReactNode) => {
    await act(async () => root.render(node));
  };
  const facts = () => container.querySelector("[data-place-facts]")?.textContent;

  it("leads the fact line with the Google type and the street, never the scraped blurb", async () => {
    await render(<PlaceCard place={place()} />);

    expect(facts()).toBe("Barbecue · 118 S Market St");
    expect(container.textContent).not.toContain("Smoked meats");
    expect(container.textContent).not.toContain("Restaurants");
  });

  it("lets only curated known_for replace the type label", async () => {
    await render(
      <PlaceCard place={place({ known_for: ["Detroit-style pizza"], primary_type: "gastropub" })} />,
    );

    expect(facts()).toBe("Detroit-style pizza · 118 S Market St");
  });

  it("keeps the rating with its count in list mode, where compact used to drop it", async () => {
    await render(
      <PlaceCard
        place={place({ google_rating: 4.6, google_rating_count: 1728, price_band: 2 })}
        compact
      />,
    );

    const rating = container.querySelector("[data-place-rating]");
    expect(rating?.textContent).toContain("4.6");
    expect(rating?.textContent).toContain("(1,728)");
    expect(rating?.textContent).toContain("Google Maps");
    expect(container.textContent).toContain("$$");
  });

  it("hides a rating backed by fewer than 20 reviews", async () => {
    await render(<PlaceCard place={place({ google_rating: 5, google_rating_count: 4 })} />);

    expect(container.querySelector("[data-place-rating]")).toBeNull();
  });

  it("prints the distance once, with no 'away' chip repeating it", async () => {
    await render(<PlaceCard place={place({ distance_m: 68 })} />);

    expect(container.querySelector("[data-place-distance]")?.textContent).toBe("223 ft");
    expect(container.textContent?.match(/223 ft/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("away");
  });

  it("never prints Local favorite on a shop or service", async () => {
    await render(
      <PlaceCard
        place={place({
          slug: "print-shop",
          name: "Frederick Print Shop",
          category: "shopping",
          primary_type: "store",
          local_favorite: true,
        })}
      />,
    );

    expect(container.textContent).not.toContain("Local favorite");
  });

  it("prints Local favorite on a destination in neutral ink", async () => {
    await render(<PlaceCard place={place({ local_favorite: true })} />);

    const mark = container.querySelector<HTMLElement>('[data-row-mark="local_favorite"]');
    expect(mark?.textContent).toBe("Local favorite");
    expect(mark?.style.color).toBe("var(--app-ink-2)");
  });

  it("shows at most one mark, a deal in Brick press rather than Plum", async () => {
    await render(
      <PlaceCard place={place({ deal_hook: "25% OFF", field_notes: true, local_favorite: true })} />,
    );

    const marks = container.querySelectorAll<HTMLElement>("[data-row-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("25% OFF");
    expect(marks[0].style.color).toBe("var(--app-brand-press)");
    expect(container.innerHTML).not.toContain("--app-accent");
  });

  it("is a flat row on a 1px rule, with no category rail or card shadow", async () => {
    await render(<PlaceCard place={place()} />);

    const article = container.querySelector<HTMLElement>("article")!;
    expect(article.className).toContain("border-b");
    expect(article.style.borderColor).toBe("var(--app-border)");
    expect(article.className).not.toMatch(/tactile|shadow|rounded-\[var\(--app-radius-lg\)\]/);
    expect(container.querySelector(".w-\\[3px\\]")).toBeNull();
  });

  it("opens the sheet from the row and keeps Save a separate target", async () => {
    await render(<PlaceCard place={place()} />);

    const buttons = [...container.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(buttons).toEqual([
      "View Black Hog BBQ Bar at 118 S Market St, Frederick, MD 21701 details",
      "Save Black Hog BBQ Bar at 118 S Market St, Frederick, MD 21701",
    ]);
  });

  it("paints a 48px tile through the photo primitive's failure signal", async () => {
    await render(<PlaceCard place={place({ google_photo_url: PROXY })} />);

    const src = new URL(
      container.querySelector("img")!.getAttribute("src")!,
      "https://frederickradius.local",
    );
    expect(src.searchParams.get("fallback")).toBe("signal");
    expect(src.searchParams.get("w")).toBe("96");
  });

  it("falls back to the category mark on the place's own flat color", async () => {
    await render(<PlaceCard place={place()} />);
    await flushHues();

    const mark = container.querySelector<HTMLElement>('[data-radius-photo="mark"]');
    expect(mark).not.toBeNull();
    expect(mark!.style.background).toContain("#3684E2");
    expect(mark!.style.background).toContain("var(--app-ink)");
    expect(mark!.style.background).not.toContain("gradient");
    expect(container.querySelector("[data-place-thumb]")?.getAttribute("data-place-thumb")).toBe(
      "category",
    );
  });
});

describe("PlaceCard lead and shelf variants", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it.each(["tile", "grid", "feature", "answer"] as const)(
    "keeps Plum off the %s variant's favorites and deals",
    async (variant) => {
      await act(async () =>
        root.render(
          <PlaceCard
            variant={variant}
            place={place({
              local_favorite: true,
              deal_hook: "$2 OFF",
              distance_m: 68,
              google_rating: 4.7,
              google_rating_count: 300,
            })}
          />,
        ),
      );

      expect(container.innerHTML).not.toContain("--app-accent");
      expect(container.textContent).not.toContain("away");
    },
  );
});
