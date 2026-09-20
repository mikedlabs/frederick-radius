// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scope", () => ({ setScope: vi.fn() }));
vi.mock("framer-motion", () => ({
  LayoutGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: () => <div /> },
}));

import { setScope } from "@/lib/scope";
import SearchRefinements from "./SearchRefinements";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("server-backed search area refinements", () => {
  let container: HTMLDivElement;
  let root: Root;
  let updates: UrlUpdateEvent[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    updates = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(town: string | null, query: string) {
    act(() => root.render(
      <NuqsTestingAdapter
        searchParams={{ q: query, in: town ?? "county", kind: "place" }}
        onUrlUpdate={(event) => updates.push(event)}
      >
        <SearchRefinements town={town} query={query} />
      </NuqsTestingAdapter>,
    ));
  }

  function button(label: string) {
    const node = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label);
    if (!node) throw new Error(`Missing area: ${label}`);
    return node;
  }

  async function select(label: string) {
    await act(async () => {
      button(label).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("refreshes server results atomically, preserves the result filter, and adds Back history", async () => {
    render("thurmont", "coffee in Thurmont");
    expect(button("Thurmont").getAttribute("aria-pressed")).toBe("true");
    expect(button("Brunswick").getAttribute("aria-pressed")).toBe("false");
    await select("Brunswick");
    expect(updates).toHaveLength(1);
    expect(Object.fromEntries(updates[0].searchParams)).toEqual({ q: "coffee", in: "brunswick", kind: "place" });
    expect(updates[0].options).toMatchObject({ shallow: false, history: "push", scroll: false });
    expect(setScope).toHaveBeenCalledWith("town:brunswick");
  });

  it("keeps whole county explicit so scope cannot fall back to a different town cookie", async () => {
    render("brunswick", "coffee in Brunswick");
    await select("Whole county");
    expect(updates[0].searchParams.get("in")).toBe("county");
    expect(updates[0].searchParams.get("q")).toBe("coffee");
    expect(setScope).toHaveBeenCalledWith("county");
  });
});
