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
