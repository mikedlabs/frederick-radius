// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./PlaceSheetProvider", () => ({
  usePlaceSheet: () => ({ openSheet: vi.fn() }),
}));
vi.mock("@/data/place-hues.json", () => ({
  default: { "black-hog-bbq-bar": "#3684E2" },
}));

import PlaceIndex, { type IndexRow } from "./PlaceIndex";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function row(overrides: Partial<IndexRow> = {}): IndexRow {
  return {
    slug: "black-hog-bbq-bar",
    name: "Black Hog BBQ Bar",
    meta: "Restaurants",
    photo: null,
    category: "restaurant",
    accent: "var(--app-brand)",
    status: { kind: "open", label: "Until 10 PM" },
    closesMin: 1320,
    rating: 4.6,
    ratingCount: 1728,
    mark: "happy hour",
    distance: null,
    ...overrides,
  };
}

describe("PlaceIndex picture rows", () => {
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

  const render = async (rows: IndexRow[]) => {
    await act(async () =>
      root.render(<PlaceIndex sections={[{ key: "eat", label: "Eat & drink", rows }]} />),
    );
  };

  it("draws the mark in Brick press, in sentence case, never Plum", async () => {
    await render([row()]);

    const mark = container.querySelector<HTMLElement>("[data-row-mark]");
    expect(mark?.textContent).toBe("Happy hour");
    expect(mark?.style.color).toBe("var(--app-brand-press)");
    expect(container.innerHTML).not.toContain("--app-accent");
  });

  it("prints the rating with its review count and source", async () => {
    await render([row()]);

    const rating = container.querySelector("[data-place-rating]");
    expect(rating?.textContent).toContain("4.6");
    expect(rating?.textContent).toContain("(1,728)");
    expect(rating?.textContent).toContain("Google Maps");
  });

  it("leads each row with a 48px picture tile, the place's color when photoless", async () => {
    await render([row()]);
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    const mark = container.querySelector<HTMLElement>('[data-radius-photo="mark"]');
    expect(mark?.style.width).toBe("48px");
    expect(mark?.style.background).toContain("#3684E2");
  });

  it("separates flat rows with a 1px rule instead of a shadowed plate", async () => {
    await render([row(), row({ slug: "two", name: "Two" })]);

    const list = container.querySelector("ul")!;
    expect(list.getAttribute("style") ?? "").not.toContain("box-shadow");
    const items = [...list.querySelectorAll("li")];
    expect(items.every((item) => item.style.borderBottom === "1px solid var(--app-border)")).toBe(
      true,
    );
  });
});
