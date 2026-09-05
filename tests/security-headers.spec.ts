import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("browser security headers", () => {
  it("allows only the official Maryland CHART camera viewer to be framed", async () => {
    const rules = await config.headers?.();
    const catchAll = rules?.find((rule) => rule.source === "/:path*");
    const applicationRule = rules?.find((rule) =>
      rule.headers.some((header) => header.key === "Content-Security-Policy"),
    );
    const policy = applicationRule?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expect(applicationRule?.source).toBe("/:path((?!fair-photo-viewer/?$).*)");
    expect(catchAll?.headers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Content-Security-Policy" }),
      ]),
    );
    expect(policy).toContain("frame-src 'self' https://chart.maryland.gov");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("frame-src *");
  });
});
