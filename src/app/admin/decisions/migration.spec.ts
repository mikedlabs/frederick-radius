import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/0043_decision_daily_aggregates.sql", "utf8");
const tableStart = sql.indexOf("CREATE TABLE IF NOT EXISTS public.decision_daily_aggregates");
const tableEnd = sql.indexOf("\n);", tableStart);
const tableDefinition = sql.slice(tableStart, tableEnd);

describe("decision aggregate migration", () => {
  it("stores only the fixed daily dimensions and count", () => {
    expect(tableStart).toBeGreaterThan(-1);
    expect(tableEnd).toBeGreaterThan(tableStart);
    const columnNames = [...tableDefinition.matchAll(
      /^ {2}([a-z_]+)\s+(?:date|text|integer|timestamptz)\b/gm,
    )].map((match) => match[1]);
    expect(columnNames).toEqual([
      "day",
      "surface",
      "stage",
      "entity_kind",
      "position",
      "action",
      "count",
      "updated_at",
    ]);
  });

  it("denies public roles and grants the server no delete privilege", () => {
    expect(sql).toContain(
      "ALTER TABLE public.decision_daily_aggregates ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).toContain(
      "GRANT SELECT, INSERT ON TABLE public.decision_daily_aggregates",
    );
    expect(sql).toContain(
      "GRANT UPDATE (count, updated_at) ON TABLE public.decision_daily_aggregates",
    );
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*decision_daily_aggregates/i);
  });
});
