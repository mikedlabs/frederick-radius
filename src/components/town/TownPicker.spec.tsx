// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { curatedPhotoCredit } from "@/lib/curated-photo-source";
import { curatedPhotoUrl, getTownPhoto } from "@/lib/integrations/wikimedia";
import type { TownStat } from "@/lib/guided/town-stats";
import TownPicker from "./TownPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const towns: TownStat[] = [
  { slug: "frederick", name: "Frederick City", fact: "The county seat.", placeCount: 4, eventCount: 3, bestFor: ["Coffee"] },
  { slug: "brunswick", name: "Brunswick", fact: "A railroad town.", placeCount: 1, eventCount: 1, bestFor: ["Outdoors"] },
  { slug: "urbana", name: "Urbana", fact: "A southern Frederick County community.", placeCount: 2, eventCount: 0, bestFor: [] },
];

const render = (town?: string) => new DOMParser().parseFromString(
  renderToStaticMarkup(<TownPicker stats={towns} town={town} />), "text/html",
);

describe("town guide atlas", () => {
  it("publishes native guide links, the selected town's actual photograph and its separate credit", () => {
    const doc = render("brunswick");
    expect([...doc.querySelectorAll('a[href^="/m/"]')].map((a) => a.getAttribute("href")).sort())
      .toEqual(["/m/brunswick", "/m/frederick", "/m/urbana"]);
    const chosen = doc.querySelector('[data-selected-town="brunswick"]')!;
    const photo = getTownPhoto("brunswick")!;
    const credit = curatedPhotoCredit(photo);
    expect(chosen.querySelector("img")?.getAttribute("alt")).toBe(photo.alt);
    expect(decodeURIComponent(chosen.querySelector("img")?.getAttribute("src") ?? "")).toContain(curatedPhotoUrl(photo));
    expect(chosen.querySelector("[data-photo-credit-line]")?.textContent).toContain(credit.author);
    expect(chosen.querySelector(`a[href="${credit.sourceHref}"]`)).not.toBeNull();
    expect(chosen.querySelector(`a[href="${credit.licenseHref}"]`)).not.toBeNull();
    expect(chosen.querySelector("[data-photo-credit-line]")?.closest("a")).toBeNull();
    expect(chosen.querySelector("svg desc")?.textContent).toContain("Town center: Brunswick");
    expect(chosen.textContent).toContain("Next 7 days · 1 event listed");
    expect(chosen.textContent).toContain("A railroad town.");
  });

  it("can locate each town in plain HTML and preserves the listing window when a town has no photograph", () => {
    const doc = render("urbana");
    const form = doc.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/towns#town-location");
    expect(form.method).toBe("get");
    expect(form.querySelector("select")?.name).toBe("town");
    expect([...form.querySelectorAll("option")].map((option) => option.value)).toEqual(["brunswick", "frederick", "urbana"]);
    expect(form.querySelector("select")?.value).toBe("urbana");
    const chosen = doc.querySelector('[data-selected-town="urbana"]')!;
    expect(chosen.querySelector("img, [data-photo-credit-line]")).toBeNull();
    expect(chosen.querySelector("svg desc")?.textContent).toContain("Town center: Urbana");
    expect(chosen.textContent).toContain("Next 7 days · No events listed");
    expect(chosen.querySelector("#town-location")).not.toBeNull();
  });

  it("updates the point, photo and shareable URL immediately and restores the previous selection on Back", async () => {
    window.history.replaceState(null, "", "/towns");
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    const push = vi.spyOn(window.history, "pushState");
    const scroll = vi.fn();
    const locatorScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scroll, configurable: true });
    let paint: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { paint = callback; return 1; });
    try {
      await act(async () => root.render(<TownPicker stats={towns} />));
      const form = container.querySelector("form")!;
      const select = form.querySelector("select")!;
      select.value = "brunswick";
      await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      paint?.(0);
      expect(window.location.pathname + window.location.search + window.location.hash).toBe("/towns?town=brunswick#town-location");
      expect(push).toHaveBeenCalledTimes(1);
      expect(container.querySelector("[data-selected-town]")?.getAttribute("data-selected-town")).toBe("brunswick");
      expect(container.querySelector("#town-location")).toBe(document.activeElement);
      expect(scroll).toHaveBeenCalled();
      await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(push).toHaveBeenCalledTimes(1);
      await act(async () => {
        window.history.replaceState(null, "", "/towns");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(container.querySelector("select")?.value).toBe("frederick");
      expect(container.querySelector("svg desc")?.textContent).toContain("Town center: Frederick City");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
      push.mockRestore();
      if (locatorScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", locatorScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("uses Frederick City when the shared selection is absent or unknown", () => {
    for (const query of [undefined, "__proto__", "not-a-town"]) {
      expect(render(query).querySelector("[data-selected-town]")?.getAttribute("data-selected-town")).toBe("frederick");
    }
  });
});
