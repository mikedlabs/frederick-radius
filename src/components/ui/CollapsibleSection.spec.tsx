import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CollapsibleSection from "./CollapsibleSection";

function render(options: { defaultOpen?: boolean; mountOnOpen?: boolean } = {}) {
  return renderToStaticMarkup(
    <CollapsibleSection
      title="All restaurants"
      storageKey="test.collapsible"
      defaultOpen={options.defaultOpen}
      mountOnOpen={options.mountOnOpen}
    >
      <span>Costly photo list</span>
    </CollapsibleSection>,
  );
}

describe("CollapsibleSection deferred mounting", () => {
  it("does not mount costly children while an opted-in section starts closed", () => {
    const html = render({ mountOnOpen: true });

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Costly photo list");
  });

  it("includes opted-in children when the section starts open", () => {
    const html = render({ mountOnOpen: true, defaultOpen: true });

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Costly photo list");
  });

  it("preserves the mounted-content default for existing disclosures", () => {
    expect(render()).toContain("Costly photo list");
  });
});

describe("CollapsibleSection disclosure row", () => {
  function renderParks(
    props: { countAriaOnly?: boolean; headingLevel?: 2 | 3; className?: string; ruled?: boolean } = {},
  ) {
    return renderToStaticMarkup(
      <CollapsibleSection
        title="Frederick City"
        count={12}
        countLabel="parks"
        storageKey="fr.parks.frederick"
        {...props}
      >
        <p>Baker Park</p>
      </CollapsibleSection>,
    );
  }

  it("names the section in .text-title-sm Ink, never the caps eyebrow", () => {
    const html = renderParks({ headingLevel: 2 });

    expect(html).toContain(
      '<span class="text-title-sm text-pretty" style="color:var(--app-ink)">Frederick City</span>',
    );
    expect(html).not.toMatch(/class="[^"]*\beyebrow\b/);
    expect(html).not.toMatch(/uppercase/);
    expect(html).not.toMatch(/tracking-/);
    expect(html).not.toMatch(/text-\[/);
  });

  it("is a 52px row under one Border rule drawn by a class", () => {
    const html = renderParks();

    expect(html).toMatch(/<section [^>]*class="border-t"/);
    expect(html).toMatch(/<section [^>]*style="border-top-color:var\(--app-border\)"/);
    expect(html).not.toMatch(/border-top:1px/);
    expect(html).toMatch(/<button [^>]*style="min-height:52px"/);
  });

  it("adds no second rule when the caller also asks for border-t", () => {
    const html = renderParks({ className: "today-disclosure mt-6 border-t pt-2" });

    expect(html).toMatch(/<section [^>]*class="border-t today-disclosure mt-6 border-t pt-2"/);
  });

  it("drops its rule when the edge above is already drawn", () => {
    const html = renderParks({ ruled: false, className: "space-y-3" });

    expect(html).toMatch(/<section [^>]*class="space-y-3"/);
    expect(html).not.toMatch(/border-t\b/);
    expect(html).not.toMatch(/border-top/);
    expect(html).toMatch(/<button [^>]*style="min-height:52px"/);
  });

  it("shows the count in quiet metadata type beside the title", () => {
    expect(renderParks()).toContain(
      '<span class="text-meta-lg tabular-nums" style="color:var(--app-ink-3)">12 parks</span>',
    );
  });

  it("keeps an aria-only count out of sight and in the section name", () => {
    const html = renderParks({ countAriaOnly: true });

    expect(html).toContain('aria-label="Frederick City (12 parks)"');
    expect(html).not.toContain("text-meta-lg");
  });

  it("wraps the trigger in the requested heading level", () => {
    expect(renderParks({ headingLevel: 2 })).toMatch(/<h2><button [^>]*aria-expanded="false"/);
    expect(renderParks({ headingLevel: 3 })).toMatch(/<h3><button /);
    expect(renderParks()).not.toMatch(/<h[23]>/);
  });

  it("points the trigger at its panel", () => {
    const html = renderParks();

    expect(html).toContain('aria-controls="collapsible-fr-parks-frederick"');
    expect(html).toContain('id="collapsible-fr-parks-frederick"');
  });
});
