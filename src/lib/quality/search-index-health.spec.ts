import { describe, expect, it } from "vitest";
import { classifyRadiusSearchIndexHealth } from "./search-index-health";

describe("classifyRadiusSearchIndexHealth", () => {
  it("reports exact current content-hash coverage", () => {
    expect(classifyRadiusSearchIndexHealth({
      expected: 1_570,
      indexed: 1_570,
      current: 1_570,
      missing: 0,
      stale: 0,
      retired: 0,
      embedded: 0,
      last_document_change_at: "2026-08-24T12:00:00.000Z",
    })).toEqual({
      status: "current",
      expected: 1_570,
      indexed: 1_570,
      current: 1_570,
      missing: 0,
      stale: 0,
      retired: 0,
      embedded: 0,
      lastDocumentChangeAt: "2026-08-24T12:00:00.000Z",
      freshnessBasis: "catalog_content_hash",
    });
  });

  it("does not hide a one-document coverage gap behind a percentage threshold", () => {
    expect(classifyRadiusSearchIndexHealth({
      expected: 1_570,
      indexed: 1_569,
      current: 1_569,
      missing: 1,
      stale: 0,
      retired: 0,
      embedded: 0,
    })).toMatchObject({
      status: "degraded",
      expected: 1_570,
      indexed: 1_569,
      current: 1_569,
      missing: 1,
    });
  });

  it("distinguishes stale hashes and retired rows from missing rows", () => {
    expect(classifyRadiusSearchIndexHealth({
      expected: "100",
      indexed: "100",
      current: "98",
      missing: "0",
      stale: "2",
      retired: "3",
      embedded: "20",
    })).toMatchObject({
      status: "degraded",
      missing: 0,
      stale: 2,
      retired: 3,
    });
  });
});
