import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import config from "../next.config";
import { GET } from "../src/app/beta/[[...path]]/route";

function visit(address: string) {
  return GET(new NextRequest(address));
}

describe("retired beta addresses", () => {
  it.each([
    "https://frederickradius.app/beta",
    "https://frederickradius.app/beta/",
    "https://frederickradius.app/beta/anything/under/it",
  ])("sends %s to Today for good", (address) => {
    const response = visit(address);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://frederickradius.app/today");
  });

  it("drops the personal code and return path an old invite link carries", () => {
    const response = visit(
      "https://frederickradius.app/beta?code=PERSONAL-CODE-123&next=%2Fmap",
    );
    const destination = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(308);
    expect(destination.pathname).toBe("/today");
    expect(destination.search).toBe("");
    expect(destination.hash).toBe("");
    expect(response.headers.get("location")).not.toContain("PERSONAL-CODE-123");
  });

  it("sets no cookie on the way through", () => {
    const response = visit("https://frederickradius.app/beta?code=PERSONAL-CODE-123");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps /beta out of the config redirects, which would forward the query string", async () => {
    const redirects = (await config.redirects?.()) ?? [];
    for (const rule of redirects) {
      expect(rule.source === "/beta" || rule.source.startsWith("/beta/")).toBe(false);
    }
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
