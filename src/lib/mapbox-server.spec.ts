import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("MAPBOX_SERVER_TOKEN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("never falls back to the publishable browser token", async () => {
    vi.stubEnv("MAPBOX_SERVER_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.public-token");
    vi.resetModules();

    const { MAPBOX_SERVER_TOKEN } = await import("./mapbox-server");

    expect(MAPBOX_SERVER_TOKEN).toBe("");
  });

  it("trims and exposes only the dedicated server credential", async () => {
    vi.stubEnv("MAPBOX_SERVER_TOKEN", "  sk.server-token  ");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.public-token");
    vi.resetModules();

    const { MAPBOX_SERVER_TOKEN } = await import("./mapbox-server");

    expect(MAPBOX_SERVER_TOKEN).toBe("sk.server-token");
  });
});
