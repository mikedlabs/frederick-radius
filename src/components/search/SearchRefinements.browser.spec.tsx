// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scope", () => ({ setScope: vi.fn() }));


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
        searchParams={{ q: query, in: town ?? "county", kind: "place", returnTo: "/map?q=coffee&in=county" }}
        onUrlUpdate={(event) => updates.push(event)}
      >
        <SearchRefinements town={town} query={query} />
      </NuqsTestingAdapter>,
    ));
  }

  function area() {
    const control = container.querySelector<HTMLSelectElement>('select#search-area');
    if (!control) throw new Error("Missing native search area control");
    return control;
  }

  async function select(value: string) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(area(), value);
      area().dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("refreshes server results atomically, preserves the result filter, and adds Back history", async () => {
    render("thurmont", "coffee in Thurmont");
    expect(area().value).toBe("thurmont");
    expect(container.querySelector('label[for="search-area"]')?.textContent).toBe("Search area");
    await select("brunswick");
    expect(updates).toHaveLength(1);
    expect(Object.fromEntries(updates[0].searchParams)).toEqual({ q: "coffee", in: "brunswick", kind: "place", returnTo: "/map?q=coffee&in=county" });
    expect(updates[0].options).toMatchObject({ shallow: false, history: "push", scroll: false });
    expect(setScope).toHaveBeenCalledWith("town:brunswick");
  });

  it("keeps whole county explicit so scope cannot fall back to a different town cookie", async () => {
    render("brunswick", "coffee in Brunswick");
    await select("county");
    expect(updates[0].searchParams.get("in")).toBe("county");
    expect(updates[0].searchParams.get("q")).toBe("coffee");
    expect(updates[0].searchParams.get("kind")).toBe("place");
    expect(updates[0].searchParams.get("returnTo")).toBe("/map?q=coffee&in=county");
    expect(setScope).toHaveBeenCalledWith("county");
  });
});
