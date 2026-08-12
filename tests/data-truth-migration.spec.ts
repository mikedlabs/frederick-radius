import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0041_data_truth_foundation.sql", import.meta.url),
  ),
  "utf8",
);

const TABLES = [
  "dataset_versions",
  "dataset_feature_versions",
  "field_observations",
  "resolved_field_state",
] as const;

describe("0041 data truth migration", () => {
  it("is additive, transactional, and bounded", () => {
    expect(migration).toMatch(/\bBEGIN;/);
    expect(migration).toMatch(/SET LOCAL lock_timeout = '5s';/);
    expect(migration).toMatch(/SET LOCAL statement_timeout = '120s';/);
    expect(migration).toMatch(/\bCOMMIT;/);
    for (const table of TABLES) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  it("keeps every truth table private and grants only server service access", () => {
    for (const table of TABLES) {
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
    }
    expect(migration).toMatch(
      /FROM PUBLIC, anon, authenticated;[\s\S]*TO service_role;/,
    );
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });

  it("retains evidence history and limits service-role lifecycle updates", () => {
    expect(migration).toMatch(
      /GRANT SELECT, INSERT ON TABLE[\s\S]*public\.field_observations[\s\S]*TO service_role;/,
    );
    expect(migration).toContain(
      "GRANT UPDATE (superseded_at)\n  ON public.dataset_feature_versions TO service_role;",
    );
    expect(migration).toContain(
      "GRANT UPDATE (verification_status, provenance)\n  ON public.field_observations TO service_role;",
    );
    expect(migration).not.toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*public\.field_observations/,
    );
  });

  it("separates unknown evidence from asserted or absent values", () => {
    expect(migration).toContain(
      "value_status IN ('asserted', 'absent', 'unavailable', 'retracted')",
    );
    expect(migration).toMatch(
      /value_status = 'asserted'[\s\S]*observed_value IS NOT NULL/,
    );
    expect(migration).toMatch(
      /value_status = 'unavailable'[\s\S]*valid_until IS NOT NULL/,
    );
  });

  it("requires bounded evidence before a field or dataset can be published", () => {
    expect(migration).toMatch(
      /status <> 'published'[\s\S]*valid_until IS NOT NULL[\s\S]*valid_until > checked_at/,
    );
    expect(migration).toMatch(
      /resolution_status = 'known'[\s\S]*winning_observation_id IS NOT NULL[\s\S]*valid_until IS NOT NULL/,
    );
    expect(migration).toMatch(
      /resolution_status = 'unknown' AND resolution_method = 'no_current_evidence'/,
    );
  });

  it("provides current and history indexes for field and GIS reads", () => {
    expect(migration).toContain("dataset_versions_current_published_uq");
    expect(migration).toContain("dataset_feature_versions_current_uq");
    expect(migration).toContain("dataset_feature_versions_history_idx");
    expect(migration).toContain("field_observations_entity_field_idx");
    expect(migration).toContain("resolved_field_state_status_expiry_idx");
  });

  it("introduces no automatic retention or destructive table operation", () => {
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/pg_cron|cron\.schedule/i);
  });
});
