import { afterEach, describe, expect, it, vi } from "vitest";
import { dbAvailable, getDb, getSql } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database release boundary", () => {
  it("does not initialize an optional database during promoted builds", () => {
    vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/radius");

    expect(dbAvailable()).toBe(false);
    expect(getDb()).toBeNull();
    expect(getSql()).toBeNull();
  });
});
