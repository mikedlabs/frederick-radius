import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("legacy tools routes", () => {
  it("sends natural and retired tool paths to the Compass workspace", async () => {
    const redirects = await config.redirects?.();
    for (const source of ["/tools", "/more", "/all-tools"]) {
      expect(redirects).toContainEqual({
        source,
        destination: "/compass",
        permanent: true,
      });
    }
  });
});
