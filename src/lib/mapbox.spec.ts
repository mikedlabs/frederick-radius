import { afterEach, describe, expect, it, vi } from "vitest";

describe("browser Mapbox credential", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails closed when the build-time browser token is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    vi.resetModules();

    const { MAPBOX_TOKEN } = await import("./mapbox");

    expect(MAPBOX_TOKEN).toBe("");
  });

  it("trims the dedicated publishable browser token", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "  pk.radius-browser  ");
    vi.resetModules();

    const { MAPBOX_TOKEN } = await import("./mapbox");

    expect(MAPBOX_TOKEN).toBe("pk.radius-browser");
  });

  it("does not embed a source-controlled publishable token", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./mapbox.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/pk\.[A-Za-z0-9._-]{20,}/);
  });
});
