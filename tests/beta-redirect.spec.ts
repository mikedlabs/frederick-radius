import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("retired beta addresses", () => {
  it("send the legacy invite page and any path under it to Today", async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      source: "/beta/:path*",
      destination: "/today",
      permanent: true,
    });
  });

  it("fold the retired admin beta desks into surviving admin pages", async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      source: "/admin/beta",
      destination: "/admin/feedback",
      permanent: true,
    });
    for (const source of ["/admin/beta-codes/:path*", "/admin/beta-emails/:path*"]) {
      expect(redirects).toContainEqual({ source, destination: "/admin", permanent: true });
    }
  });

  it("never sends anyone back into a retired beta address", async () => {
    const redirects = (await config.redirects?.()) ?? [];
    for (const rule of redirects) {
      expect(rule.destination.startsWith("/beta")).toBe(false);
      expect(rule.destination.startsWith("/admin/beta")).toBe(false);
    }
  });
});
