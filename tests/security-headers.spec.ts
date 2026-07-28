import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("browser security headers", () => {
  it("allows only the official Maryland CHART camera viewer to be framed", async () => {
    const rules = await config.headers?.();
    const catchAll = rules?.find((rule) => rule.source === "/:path*");
    const policy = catchAll?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expect(policy).toContain("frame-src 'self' https://chart.maryland.gov");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("frame-src *");
  });
});
