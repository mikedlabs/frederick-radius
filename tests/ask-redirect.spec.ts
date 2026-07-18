import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("legacy Ask Radius route", () => {
  it("sends old /guide links to the dedicated Ask workspace", async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      source: "/guide",
      destination: "/ask",
      permanent: true,
    });
  });
});
