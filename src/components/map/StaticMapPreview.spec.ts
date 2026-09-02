import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StaticMapPreview", () => {
  it("replaces a failed paid image with an actionable local-map handoff", () => {
    const source = readFileSync(
      new URL("./StaticMapPreview.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("onError={() => setFailed(true)}");
    expect(source).toContain("Map preview unavailable. Open the live map.");
    expect(source).toContain("hidden={!failed}");
  });
});
