import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/0044_data_truth_fk_indexes.sql", "utf8");

describe("data truth foreign-key indexes migration", () => {
  it("covers every composite referencing key reported by the database advisor", () => {
    expect(sql).toContain(
      "ON public.dataset_feature_versions (dataset_version_id, dataset_key)",
    );
    expect(sql).toContain(
      "ON public.field_observations (dataset_version_id, dataset_key)",
    );
    expect(sql).toMatch(
      /ON public\.resolved_field_state \(\s*winning_observation_id,\s*entity_kind,\s*entity_key,\s*field_name\s*\)/,
    );
  });

  it("is additive, bounded, and does not claim a production apply", () => {
    expect(sql.match(/CREATE INDEX IF NOT EXISTS/g)).toHaveLength(3);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("SET LOCAL statement_timeout = '30s'");
    expect(sql).not.toMatch(/DROP\s+(?:INDEX|TABLE)/i);
    expect(sql).not.toMatch(/GRANT\s+/i);
  });
});
