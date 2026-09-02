import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FairEssentialsRail from "./FairEssentialsRail";

describe("FairEssentialsRail", () => {
  it("keeps source-backed visitor needs one tap away without unsupported claims", () => {
    const html = renderToStaticMarkup(
      <FairEssentialsRail
        onOpenHelp={() => undefined}
        onOpenTravel={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Visitor essentials"');
    expect(html).toContain("Access guide");
    expect(html).toContain("Easy to miss");
    expect(html).toContain("Family Care + changing");
    expect(html).toContain("Lost person or item");
    expect(html).toContain("Save car");
    expect(html).toContain("Fair help");
    expect(html).not.toMatch(/first aid/i);
    expect(html).not.toMatch(/nearest|directions/i);
    expect(html).not.toContain("Car + leave");
  });
});
