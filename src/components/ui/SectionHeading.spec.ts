import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SectionHeading from "./SectionHeading";

function render(props: Parameters<typeof SectionHeading>[0]) {
  return renderToStaticMarkup(createElement(SectionHeading, props));
}

function headingOf(html: string) {
  const heading = html.match(/<h2 class="([^"]*)" style="([^"]*)">([\s\S]*?)<\/h2>/);
  expect(heading).not.toBeNull();
  return { className: heading![1], style: heading![2], inner: heading![3] };
}

describe("SectionHeading", () => {
  it("sets the primary title as .text-title in solid Ink, never caps", () => {
    const heading = headingOf(render({ title: "Worth your time", count: 12, href: "/places" }));

    expect(heading.className.split(" ")).toContain("text-title");
    expect(heading.className).toContain("font-sans");
    expect(heading.className).not.toContain("font-serif");
    expect(heading.className).not.toContain("uppercase");
    expect(heading.className).not.toMatch(/text-\[/);
    expect(heading.style).toBe("color:var(--app-ink)");
    expect(heading.inner).toBe("Worth your time");
  });

  it("keeps the 4px tick on the primary register and drops the trailing hairline", () => {
    const html = render({ title: "Start here", accent: "var(--app-cool)" });

    expect(html).toContain('data-section-heading-tick="true"');
    expect(html).toMatch(/class="inline-block h-4 w-1 shrink-0 rounded-full" style="background:var\(--app-cool\)"/);
    expect(html).not.toContain("background:var(--app-border)");
    expect(html).not.toContain("h-px");
  });

  it("falls back to the route accent, then Brick, for the tick", () => {
    expect(render({ title: "Start here" })).toContain(
      "background:var(--section-accent, var(--app-brand))",
    );
  });

  it("never renders gradient-filled text or a gradient rule", () => {
    for (const size of ["lg", "sm"] as const) {
      const html = render({ title: "Pools", count: 3, size, accent: "var(--app-cool)" });

      expect(html).not.toMatch(/background-clip/i);
      expect(html).not.toMatch(/text-fill-color/i);
      expect(html).not.toContain("linear-gradient");
    }
  });

  it("moves the count into a link CTA so the heading names only the section", () => {
    const html = render({ title: "All restaurants", count: 183, href: "/category/restaurant" });
    const heading = headingOf(html);

    expect(heading.inner).toBe("All restaurants");
    expect(html).not.toContain("data-section-heading-count");
    expect(html).toMatch(/<a [^>]*href="\/category\/restaurant"[^>]*>See all 183<svg/);
  });

  it("renders a count without a link after the title in quiet metadata type", () => {
    const html = render({ title: "Nearby places", count: 26 });
    const heading = headingOf(html);

    expect(heading.inner).toBe("Nearby places");
    expect(html).toContain(
      '<span data-section-heading-count="true" class="text-meta-lg tabular-nums" style="color:var(--app-ink-3)">26</span>',
    );
    expect(render({ title: "Nearby places" })).not.toContain("data-section-heading-count");
  });

  it("keeps a toggle CTA's label unchanged and leaves the count after the title", () => {
    const html = render({ title: "What starts soon", count: 4, cta: "Show all", onCtaClick: () => {} });

    expect(html).toMatch(/<button [^>]*>Show all<\/button>/);
    expect(html).toContain('data-section-heading-count="true"');
  });

  it("sets the CTA in Brick press body type with a 44px target", () => {
    const html = render({ title: "From your saved", href: "/my-radius", cta: "All saved" });
    const link = html.match(/<a class="([^"]*)" style="([^"]*)" href="\/my-radius">/);

    expect(link).not.toBeNull();
    const classes = link![1].split(" ");
    expect(classes).toContain("text-body");
    expect(classes).toContain("font-semibold");
    expect(classes).toContain("min-h-11");
    expect(classes).toContain("min-w-11");
    expect(link![2]).toBe("color:var(--app-brand-press)");
    expect(html).toContain("All saved<svg");
  });

  it("sets the secondary register as .text-title-sm with no tick", () => {
    const html = render({ title: "Pools", size: "sm" });
    const heading = headingOf(html);

    expect(heading.className.split(" ")).toContain("text-title-sm");
    expect(heading.className.split(" ")).not.toContain("text-title");
    expect(html).not.toContain("data-section-heading-tick");
  });

  it("renders a trailing control in place of the CTA", () => {
    const html = render({
      title: "Nearby places",
      count: 26,
      href: "/places",
      trailing: createElement("button", { type: "button" }, "Sort"),
    });

    expect(html).toContain("<button type=\"button\">Sort</button>");
    expect(html).not.toContain('href="/places"');
    expect(html).toContain('data-section-heading-count="true"');
  });
});
