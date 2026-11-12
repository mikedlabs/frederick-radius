/** @vitest-environment jsdom */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootNotFound, { metadata as rootMetadata } from "@/app/not-found";
import AppNotFound, { metadata as appMetadata } from "@/app/(app)/not-found";
import AppMain from "./AppMain";
import NotFoundContent from "./NotFoundContent";

vi.mock("next/navigation", () => ({
  usePathname: () => "/__radius_unknown_route__",
  useRouter: () => ({ push: vi.fn() }),
}));

function documentFor(element: React.ReactElement) {
  return new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");
}

describe("404 landmark ownership", () => {
  it("gives standalone and app-shell 404s exactly one main and skip-link target", () => {
    const standalone = documentFor(createElement(RootNotFound));
    const inApp = documentFor(createElement(AppMain, null, createElement(AppNotFound)));
    for (const doc of [standalone, inApp]) {
      expect(doc.querySelectorAll("main")).toHaveLength(1);
      expect(doc.querySelectorAll("#main-content")).toHaveLength(1);
      expect(doc.querySelector("main")?.getAttribute("tabindex")).toBe("-1");
      expect(doc.querySelectorAll("h1")).toHaveLength(1);
      expect(doc.querySelector("h1")?.textContent).toBe("That page isn't here.");
    }
    expect(documentFor(createElement(NotFoundContent)).querySelectorAll("main, #main-content")).toHaveLength(0);
    expect(documentFor(createElement(AppNotFound)).querySelectorAll("main, #main-content")).toHaveLength(0);
  });

  it("shares the exact presentation, search and recovery actions across boundaries", () => {
    const standalone = documentFor(createElement(RootNotFound)).querySelector("main")!.firstElementChild!;
    const inApp = documentFor(createElement(AppMain, null, createElement(AppNotFound))).querySelector("main")!.firstElementChild!;
    expect(inApp.outerHTML).toBe(standalone.outerHTML);
    expect(standalone.querySelector("form")?.getAttribute("action")).toBe("/search");
    expect(Array.from(standalone.querySelectorAll("a"), link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Back home", "/today"], ["See events", "/events"], ["Map", "/map"],
      ["Eat & drink", "/category/food"], ["Coffee", "/category/coffee"], ["Saved", "/my-radius"],
    ]);
    expect(rootMetadata).toEqual({
      title: "Page not found",
      description: "That Frederick Radius page could not be found. Search the guide or return to Today.",
      robots: { index: false, follow: true },
    });
    expect(appMetadata).toBe(rootMetadata);
  });
});
