import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { FAIR_PHOTO_VIEWER_CSP, FAIR_PHOTO_VIEWER_SCRIPT } from "@/lib/fair/photo-viewer";

describe("isolated Fair photo document", () => {
  it("allows the required Wasm/data fetch only inside the renderer document", async () => {
    const response = GET();
    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toBe(FAIR_PHOTO_VIEWER_CSP);
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).toContain("connect-src 'self' data:");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).toContain(FAIR_PHOTO_VIEWER_SCRIPT);
    expect(html).toContain("during a previous fair");
    expect(html).not.toMatch(/plausible|supabase|__next|analytics/i);
  });
  it("keeps the application policy from intersecting the exact viewer route", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('source: "/:path((?!fair-photo-viewer/?$).*)"');
    expect(config).not.toContain("wasm-unsafe-eval");
    const match = /^(?!fair-photo-viewer\/?$).*$/;
    expect(match.test("fair-photo-viewer")).toBe(false);
    expect(match.test("fair-photo-viewer/")).toBe(false);
    expect(match.test("fair-photo-viewer/anything")).toBe(true);
    expect(match.test("moments/great-frederick-fair-2026")).toBe(true);
    expect(match.test("")).toBe(true);
  });
});
