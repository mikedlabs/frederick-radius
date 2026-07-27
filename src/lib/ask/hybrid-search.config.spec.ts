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
    gateway: process.env.AI_GATEWAY_API_KEY,
    oidc: process.env.VERCEL_OIDC_TOKEN,
    vercel: process.env.VERCEL,
    hybrid: process.env.RADIUS_HYBRID_SEARCH,
  };

  beforeEach(() => {
    mocks.sql = () => Promise.resolve([]);
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;
    delete process.env.RADIUS_HYBRID_SEARCH;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries({
      AI_GATEWAY_API_KEY: original.gateway,
      VERCEL_OIDC_TOKEN: original.oidc,
      VERCEL: original.vercel,
      RADIUS_HYBRID_SEARCH: original.hybrid,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("recognizes Vercel request-context OIDC without a stored gateway key", () => {
    process.env.VERCEL = "1";
    expect(hybridSearchConfigured()).toBe(true);
  });

  it("does not attempt Gateway work locally without authentication", () => {
    expect(hybridSearchConfigured()).toBe(false);
  });

  it("honors the explicit semantic-search kill switch", () => {
    process.env.VERCEL = "1";
    process.env.RADIUS_HYBRID_SEARCH = "0";
    expect(hybridSearchConfigured()).toBe(false);
  });
});
