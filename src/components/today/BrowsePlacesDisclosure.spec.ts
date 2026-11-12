// @vitest-environment jsdom

import { act, createElement, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BrowsePlacesDisclosure, {
  shouldOpenBrowseFromSearch,
} from "./BrowsePlacesDisclosure";

vi.mock("@/lib/haptics", () => ({ haptic: () => undefined }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("BrowsePlacesDisclosure", () => {
  it("keeps a useful native route on first paint while the panel stays closed", () => {
    const EmbeddedBrowse = BrowsePlacesDisclosure as ComponentType<{ embedded?: boolean }>;
    const html = renderToStaticMarkup(
      createElement(
        EmbeddedBrowse,
        { embedded: true },
        createElement("span", null, "Category choices"),
      ),
    );

    expect(html).toContain('data-surface-row="browse"');
    expect(html).toContain('href="/places"');
    expect(html).toContain('id="browse-places-panel"');
    expect(html).toContain("Browse all places");
    expect(html).not.toContain("Category choices");
    expect(html).toContain('data-state="closed"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inert");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain("data-ready");
    expect(html).not.toContain(' hidden=""');
    expect(html).not.toContain('class="mt-3"');
  });

  it("recognizes a shared answer URL that must reveal the category panel", () => {
    expect(shouldOpenBrowseFromSearch("?want=coffee")).toBe(true);
    expect(shouldOpenBrowseFromSearch("?want=cat%3Aplaygrounds&facet=kids")).toBe(true);
    expect(shouldOpenBrowseFromSearch("?want=%20%20")).toBe(false);
    expect(shouldOpenBrowseFromSearch("?facet=kids")).toBe(false);
  });

  it("keeps closed hydrated consumers dormant, then preserves their state after first reveal", async () => {
    const originalPath = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState(null, "", "/today");
    const consumerRead = vi.fn(), consumerCleanup = vi.fn();
    function CategoryConsumer() {
      const [count, setCount] = useState(0);
      useEffect(() => { consumerRead(); return consumerCleanup; }, []);
      return createElement("button", { type: "button", onClick: () => setCount(value => value + 1) }, `Selected ${count}`);
    }
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(BrowsePlacesDisclosure, null, createElement(CategoryConsumer))));
      const trigger = container.querySelector<HTMLButtonElement>('button[aria-controls="browse-places-panel"]')!;
      const panel = container.querySelector<HTMLElement>("#browse-places-panel")!;
      expect(trigger.getAttribute("data-ready")).toBe("true");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(panel.hasAttribute("inert")).toBe(true);
      expect(panel.querySelector("button")).toBeNull();
      expect(consumerRead).not.toHaveBeenCalled();

      await act(async () => trigger.click());
      expect(consumerRead).toHaveBeenCalledTimes(1);
      const selection = panel.querySelector<HTMLButtonElement>("button")!;
      await act(async () => selection.click());
      expect(selection.textContent).toBe("Selected 1");
      await act(async () => trigger.click());
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(panel.getAttribute("aria-hidden")).toBe("true");
      expect(panel.hasAttribute("inert")).toBe(true);
      expect(panel.querySelector("button")).toBe(selection);
      expect(consumerCleanup).not.toHaveBeenCalled();

      await act(async () => trigger.click());
      expect(panel.hasAttribute("inert")).toBe(false);
      expect(panel.querySelector("button")).toBe(selection);
      expect(selection.textContent).toBe("Selected 1");
      expect(consumerRead).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount()); container.remove();
      window.history.replaceState(null, "", originalPath);
    }
    expect(consumerCleanup).toHaveBeenCalledTimes(1);
  });

  it.each(["?want=coffee", "?want=cat%3Aplaygrounds&facet=kids"])("reveals restored answer consumers after hydration for %s", async search => {
    const originalPath = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState(null, "", `/today${search}`);
    const consumerRead = vi.fn();
    function RestoredConsumer() {
      useEffect(() => { consumerRead(); }, []);
      return createElement("span", null, "Restored answer");
    }
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(BrowsePlacesDisclosure, null, createElement(RestoredConsumer))));
      expect(container.querySelector('button[aria-controls="browse-places-panel"]')?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("#browse-places-panel")?.hasAttribute("inert")).toBe(false);
      expect(container.textContent).toContain("Restored answer");
      expect(consumerRead).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe(search);
    } finally {
      await act(async () => root.unmount()); container.remove();
      window.history.replaceState(null, "", originalPath);
    }
  });

  it("upgrades the native route into an accessible accordion after hydration", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          BrowsePlacesDisclosure,
          null,
          createElement("a", { href: "/category/coffee" }, "Coffee"),
        ),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="browse-places-panel"]',
    );
    expect(trigger?.textContent).toContain("Browse all categories");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('a[href="/places"]')).toBeNull();

    await act(async () => trigger?.click());

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(
      container.querySelector("#browse-places-panel")?.getAttribute("data-state"),
    ).toBe("open");
    expect(container.querySelector("#browse-places-panel")?.hasAttribute("inert"))
      .toBe(false);

    await act(async () => root.unmount());
    container.remove();
  });
});
