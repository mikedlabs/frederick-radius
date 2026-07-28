import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: null as unknown,
}));

vi.mock("@/lib/db/client", () => ({
  getSql: () => mocks.sql,
}));

import { hybridSearchConfigured } from "./hybrid-search";

describe("hybridSearchConfigured", () => {
  const original = {
    hybrid: process.env.RADIUS_HYBRID_SEARCH,
  };

  beforeEach(() => {
    mocks.sql = () => Promise.resolve([]);
    delete process.env.RADIUS_HYBRID_SEARCH;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries({
      RADIUS_HYBRID_SEARCH: original.hybrid,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("enables database FTS without any AI credentials", () => {
    expect(hybridSearchConfigured()).toBe(true);
  });

  it("stays off when the search database is unavailable", () => {
    mocks.sql = null;
    expect(hybridSearchConfigured()).toBe(false);
  });

  it("honors the explicit hybrid-search kill switch", () => {
    process.env.RADIUS_HYBRID_SEARCH = "0";
    expect(hybridSearchConfigured()).toBe(false);
  });
});
