import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SectionHeading from "./SectionHeading";

function render(props: Parameters<typeof SectionHeading>[0]) {
  return renderToStaticMarkup(createElement(SectionHeading, props));
}

describe("SectionHeading", () => {
  it("paints the primary title in solid ink at Public Sans 20 semibold", () => {
    const html = render({ title: "Worth your time", count: 12, href: "/places" });
    const heading = html.match(/<h2 class="([^"]*)" style="([^"]*)"/);

    expect(heading).not.toBeNull();
    expect(heading![1]).toContain("font-sans");
    expect(heading![1]).toContain("text-[20px]");
    expect(heading![1]).toContain("font-semibold");
    expect(heading![1]).not.toContain("font-serif");
    expect(heading![1]).not.toContain("uppercase");
    expect(heading![2]).toBe("color:var(--app-ink)");
    expect(html).toContain('<span class="truncate">Worth your time</span>');
  });

  it("never renders gradient-filled text or a gradient rule", () => {
    for (const size of ["lg", "sm"] as const) {
      const html = render({ title: "Pools", count: 3, size, accent: "var(--app-cool)" });

      expect(html).not.toMatch(/background-clip/i);
      expect(html).not.toMatch(/text-fill-color/i);
      expect(html).not.toContain("linear-gradient");
      expect(html).toContain("background:var(--app-border)");
    }
  });

  it("keeps the count quiet at 13 pixels in muted ink", () => {
    const html = render({ title: "Nearby places", count: 26 });

    expect(html).toContain(
      '<span class="font-data text-[13px] font-normal" style="color:var(--app-ink-3)">26</span>',
    );
    expect(render({ title: "Nearby places" })).not.toContain("font-data");
  });

  it("keeps the secondary register below the primary title", () => {
    const html = render({ title: "Pools", size: "sm" });

    expect(html).toContain("text-[16px]");
    expect(html).toContain("font-semibold");
    expect(html).not.toContain("text-[20px]");
  });
});
