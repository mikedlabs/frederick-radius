// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import PageBloom from "./PageBloom";

function mount(markup: string) {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
}

describe("PageBloom paper", () => {
  it("keeps the static paper and grain and draws no decorative glow", () => {
    const host = mount(renderToStaticMarkup(<PageBloom />));
    const bloom = host.querySelector("[data-page-bloom]");

    expect(bloom).not.toBeNull();
    expect(bloom?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("[data-page-paper]")).not.toBeNull();
    expect(host.querySelector(".aurora-grain")).not.toBeNull();
    // The two blurred blobs contradicted docs/DESIGN_TELLS.md: "Decorative
    // glows are not part of the public product."
    expect(host.innerHTML).not.toMatch(/blur-\[|mix-blend|rounded-full/);
    expect(host.querySelectorAll("[data-ambient-layer]")).toHaveLength(0);
  });

  it("holds the optional editorial motif still", () => {
    const markup = renderToStaticMarkup(<PageBloom motif variant="warm" />);
    const host = mount(markup);
    const motif = host.querySelector<HTMLElement>("[data-page-motif]");

    expect(motif).not.toBeNull();
    expect(motif?.getAttribute("style")).toBe("color:var(--app-brand);opacity:0.055");
    expect(host.querySelector("[data-page-motif] svg")).not.toBeNull();
  });

  it("omits the motif unless a page asks for it", () => {
    const host = mount(renderToStaticMarkup(<PageBloom variant="cool" />));
    expect(host.querySelector("[data-page-motif]")).toBeNull();
  });

  it("runs no animation library or motion loop", () => {
    const source = readFileSync("src/components/ui/PageBloom.tsx", "utf8");
    expect(source).not.toContain("framer-motion");
    expect(source).not.toContain("repeat: Infinity");
    expect(source).not.toContain('"use client"');
  });
});
