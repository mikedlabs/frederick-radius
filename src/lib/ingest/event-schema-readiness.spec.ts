import { describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
import { checkEventSchemaReadiness } from "./event-schema-readiness";

function sqlReturning(
  rows: Array<{ table_name: string; column_name: string }>,
): { sql: Sql; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async () => rows);
  return { sql: query as unknown as Sql, query };
}

describe("event writer schema readiness", () => {
  it("returns an actionable migration gap before civic rows are written", async () => {
    const { sql, query } = sqlReturning([
      { table_name: "ingested_events", column_name: "hero_image" },
      { table_name: "ingested_events", column_name: "hero_image_alt" },
    ]);

    await expect(
      checkEventSchemaReadiness(sql, "civic-ingest"),
    ).resolves.toEqual({
      ready: false,
      missing: [
        "ingested_events.hero_image",
        "ingested_events.hero_image_alt",
      ],
    });
    const tables = query.mock.calls[0]?.[1] as string[];
    const columns = query.mock.calls[0]?.[2] as string[];
    expect(
      tables.map((table, index) => `${table}.${columns[index]}`),
    ).toEqual(expect.arrayContaining([
      "ingested_events.hero_image",
      "ingested_events.hero_image_alt",
    ]));
  });

  it("reports an archive schema that is ready", async () => {
    const { sql } = sqlReturning([]);
    await expect(
      checkEventSchemaReadiness(sql, "event-archive"),
    ).resolves.toEqual({ ready: true, missing: [] });
  });
});
