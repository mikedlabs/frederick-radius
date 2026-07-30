import { describe, expect, it, vi } from "vitest";
import { emptyStats, upsertEvent } from "@/lib/ingest/upsert";
import type { ParsedEvent } from "@/lib/ingest/parser";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ").replace(/\s+/g, " ").trim();
}

type State = {
  raw?: { id: string; dtstamp: string; sourceUrl?: string | null };
  normalized?: {
    category: string | null;
    sourceUrl?: string | null;
    heroImage?: string | null;
    heroImageAlt?: string | null;
  };
};

function transactionalSql({
  initial,
  failNormalizedWrites = 0,
}: {
  initial?: State;
  failNormalizedWrites?: number;
} = {}) {
  let state: State = structuredClone(initial ?? {});
  let failuresRemaining = failNormalizedWrites;
  const transactions: Array<ReturnType<typeof vi.fn>> = [];

  function execute(
    target: State,
    strings: TemplateStringsArray,
    parameters: unknown[],
    injectFailure: boolean,
  ) {
    const text = queryText(strings);
    if (
      text.includes("from raw_events") &&
      text.includes("left join ingested_events")
    ) {
      return Promise.resolve(
        target.raw
          ? [
              {
                id: target.raw.id,
                dtstamp: target.raw.dtstamp,
                raw_source_url: target.raw.sourceUrl ?? null,
                normalized_id: target.normalized
                  ? "normalized-event-1"
                  : null,
                category: target.normalized?.category ?? null,
                normalized_source_url:
                  target.normalized?.sourceUrl ?? null,
                normalized_hero_image:
                  target.normalized?.heroImage ?? null,
                normalized_hero_image_alt:
                  target.normalized?.heroImageAlt ?? null,
              },
            ]
          : [],
      );
    }
    if (text.includes("insert into raw_events")) {
      if (target.raw) return Promise.resolve([]);
      target.raw = {
        id: "raw-event-1",
        dtstamp: String(parameters[4]),
        sourceUrl: (parameters[2] as string | null) ?? null,
      };
      return Promise.resolve([{ id: target.raw.id }]);
    }
    if (text.includes("update raw_events")) {
      if (target.raw) {
        target.raw.sourceUrl = (parameters[0] as string | null) ?? null;
        if (text.includes("raw_vevent")) {
          target.raw.dtstamp = String(parameters[2]);
        }
      }
      return Promise.resolve([]);
    }
    if (
      text.includes("update ingested_events") &&
      text.includes("set source_url = case")
    ) {
      if (!target.normalized) return Promise.resolve([]);
      const healSourceUrl = parameters[0] === true;
      const sourceUrl = (parameters[1] as string | null) ?? null;
      const healCategory = parameters[2] === true;
      const category = (parameters[3] as string | null) ?? null;
      const healHeroImage = parameters[4] === true;
      const heroImage = (parameters[5] as string | null) ?? null;
      const healHeroImageAlt = parameters[6] === true;
      const heroImageAlt = (parameters[7] as string | null) ?? null;
      target.normalized = {
        sourceUrl: healSourceUrl
          ? sourceUrl
          : target.normalized.sourceUrl,
        category: healCategory
          ? category
          : target.normalized.category,
        heroImage: healHeroImage
          ? heroImage
          : target.normalized.heroImage,
        heroImageAlt: healHeroImageAlt
          ? heroImageAlt
          : target.normalized.heroImageAlt,
      };
      return Promise.resolve([{ id: "normalized-event-1" }]);
    }
    if (
      text.includes("update ingested_events") &&
      text.includes("set category = case")
    ) {
      if (!target.normalized) {
        return Promise.resolve([]);
      }
      const categoryCoverageComplete = parameters[0] === true;
      const category = (parameters[1] as string | null) ?? null;
      const heroImage = (parameters[2] as string | null) ?? null;
      const heroImageAlt = (parameters[3] as string | null) ?? null;
      const changed =
        (categoryCoverageComplete &&
          target.normalized.category !== category) ||
        (target.normalized.heroImage ?? null) !== heroImage ||
        (target.normalized.heroImageAlt ?? null) !== heroImageAlt;
      if (!changed) return Promise.resolve([]);
      target.normalized = {
        ...target.normalized,
        category: categoryCoverageComplete
          ? category
          : target.normalized.category,
        heroImage,
        heroImageAlt,
      };
      return Promise.resolve([{ id: "normalized-event-1" }]);
    }
    if (text.includes("insert into ingested_events")) {
      if (injectFailure && failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw new Error("normalized write failed");
      }
      const incomingCategory =
        (parameters[13] as string | null) ?? null;
      const incomingHeroImage =
        (parameters[14] as string | null) ?? null;
      const incomingHeroImageAlt =
        (parameters[15] as string | null) ?? null;
      const coverageComplete = parameters[16] !== false;
      target.normalized = {
        sourceUrl: (parameters[3] as string | null) ?? null,
        category:
          target.normalized && !coverageComplete
            ? target.normalized.category
            : incomingCategory,
        heroImage: incomingHeroImage,
        heroImageAlt: incomingHeroImageAlt,
      };
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }

  const begin = vi.fn(
    async (
      callback: (
        tx: ReturnType<typeof vi.fn>,
      ) => Promise<unknown>,
    ) => {
      const draft = structuredClone(state);
      const tx = vi.fn(
        (strings: TemplateStringsArray, ...parameters: unknown[]) =>
          execute(draft, strings, parameters, true),
      );
      transactions.push(tx);

      // Model postgres.js transaction semantics: only publish the draft after
      // every callback statement succeeds.
      const result = await callback(tx);
      state = draft;
      return result;
    },
  );
  const direct = vi.fn(
    (strings: TemplateStringsArray, ...parameters: unknown[]) =>
      execute(state, strings, parameters, false),
  );
  const sql = Object.assign(direct, { begin });

  return {
    sql: sql as never,
    direct,
    begin,
    transactions,
    state: () => state,
  };
}

function event(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    uid: "event-1",
    summary: "Community event",
    startsAtUtc: "2026-08-01T22:00:00.000Z",
    endsAtUtc: "2026-08-02T00:00:00.000Z",
    tzid: "America/New_York",
    allDay: false,
    dtstamp: "2026-07-02T12:00:00.000Z",
    rawVevent: "BEGIN:VEVENT\nUID:event-1\nEND:VEVENT",
    ...overrides,
  };
}

describe("upsertEvent transaction and reconciliation", () => {
  it("rolls raw advancement back when normalization fails so the next run retries it", async () => {
    const db = transactionalSql({
      initial: {
        raw: {
          id: "raw-event-1",
          dtstamp: "2026-07-01T12:00:00.000Z",
        },
        normalized: { category: "old-category" },
      },
      failNormalizedWrites: 1,
    });
    const stats = emptyStats();
    const incoming = event();
    const opts = {
      sourceDomain: "calendar.example",
      municipality: "frederick",
      category: "community",
    };

    await expect(
      upsertEvent(db.sql, opts, incoming, stats),
    ).rejects.toThrow("normalized write failed");

    expect(db.state()).toEqual({
      raw: {
        id: "raw-event-1",
        dtstamp: "2026-07-01T12:00:00.000Z",
      },
      normalized: { category: "old-category" },
    });
    expect(stats).toEqual(emptyStats());

    await expect(
      upsertEvent(db.sql, opts, incoming, stats),
    ).resolves.toBeUndefined();

    expect(db.begin).toHaveBeenCalledTimes(2);
    expect(db.state()).toMatchObject({
      raw: { dtstamp: incoming.dtstamp },
      normalized: { category: "community" },
    });
    expect(stats).toMatchObject({
      rawInserted: 0,
      rawUpdated: 1,
      rawUnchanged: 0,
      normUpserted: 1,
    });
    expect(
      db.transactions.every((tx) =>
        tx.mock.calls.some(([strings]) =>
          queryText(strings).includes("update raw_events"),
        ),
      ),
    ).toBe(true);
  });

  it("heals a partial-run category when complete feeds recover without a DTSTAMP change", async () => {
    const db = transactionalSql();
    const incoming = event();

    await upsertEvent(
      db.sql,
      {
        sourceDomain: "calendar.example",
        municipality: "frederick",
        category: "Parks & Recreation",
        categoryCoverageComplete: false,
      },
      incoming,
      emptyStats(),
    );
    expect(db.state().normalized?.category).toBe("Parks & Recreation");

    const healedStats = emptyStats();
    await upsertEvent(
      db.sql,
      {
        sourceDomain: "calendar.example",
        municipality: "frederick",
        // The recovered second category feed exposes a conflict, so the
        // deterministic route mapper supplies null.
        category: null,
        categoryCoverageComplete: true,
      },
      incoming,
      healedStats,
    );

    expect(db.state().normalized?.category).toBeNull();
    expect(healedStats).toMatchObject({
      rawUnchanged: 1,
      normUpserted: 1,
    });
    expect(
      db.direct.mock.calls.some(([strings]) =>
        queryText(strings).includes("set category ="),
      ),
    ).toBe(true);
  });

  it("does not let a later partial run downgrade a category from complete coverage", async () => {
    const db = transactionalSql({
      initial: {
        raw: {
          id: "raw-event-1",
          dtstamp: "2026-07-02T12:00:00.000Z",
        },
        normalized: { category: null },
      },
    });

    await upsertEvent(
      db.sql,
      {
        sourceDomain: "calendar.example",
        municipality: "frederick",
        category: "Parks & Recreation",
        categoryCoverageComplete: false,
      },
      event({ dtstamp: "2026-07-03T12:00:00.000Z" }),
      emptyStats(),
    );

    expect(db.state().normalized?.category).toBeNull();
  });

  it("keeps an unchanged matching event on the one-read hot path", async () => {
    const db = transactionalSql({
      initial: {
        raw: {
          id: "raw-event-1",
          dtstamp: "2026-07-02T12:00:00.000Z",
          sourceUrl: "https://calendar.example/event-1",
        },
        normalized: {
          category: "community",
          sourceUrl: "https://calendar.example/event-1",
        },
      },
    });
    const stats = emptyStats();

    await upsertEvent(
      db.sql,
      {
        sourceDomain: "calendar.example",
        municipality: "frederick",
        category: "community",
      },
      event({ sourceUrl: "https://calendar.example/event-1" }),
      stats,
    );

    expect(db.direct).toHaveBeenCalledOnce();
    expect(db.begin).not.toHaveBeenCalled();
    expect(stats.rawUnchanged).toBe(1);
    expect(stats.normUpserted).toBe(0);
  });

  it("heals a corrected official URL without requiring a DTSTAMP change", async () => {
    const db = transactionalSql({
      initial: {
        raw: {
          id: "raw-event-1",
          dtstamp: "2026-07-02T12:00:00.000Z",
          sourceUrl: "/common/modules/iCalendar/iCalendar.aspx",
        },
        normalized: {
          category: "community",
          sourceUrl: "/common/modules/iCalendar/iCalendar.aspx",
        },
      },
    });
    const stats = emptyStats();
    const officialUrl =
      "https://www.cityoffrederickmd.gov/calendar.aspx?EID=22352";

    await upsertEvent(
      db.sql,
      {
        sourceDomain: "www.cityoffrederickmd.gov",
        municipality: "frederick",
        category: "community",
      },
      event({ sourceUrl: officialUrl }),
      stats,
    );

    expect(db.state()).toMatchObject({
      raw: { sourceUrl: officialUrl },
      normalized: { sourceUrl: officialUrl },
    });
    expect(stats).toMatchObject({
      rawUpdated: 1,
      rawUnchanged: 0,
      normUpserted: 1,
    });
  });

  it("heals newly available publisher event art without requiring a DTSTAMP change", async () => {
    const sourceUrl = "https://frederick.librarycalendar.com/event/art-class";
    const db = transactionalSql({
      initial: {
        raw: {
          id: "raw-event-1",
          dtstamp: "2026-07-02T12:00:00.000Z",
          sourceUrl,
        },
        normalized: {
          category: "community",
          sourceUrl,
          heroImage: null,
          heroImageAlt: null,
        },
      },
    });
    const stats = emptyStats();
    const heroImage =
      "https://frederick.librarycalendar.com/sites/default/files/2026-07/art-class.jpg";

    await upsertEvent(
      db.sql,
      {
        sourceDomain: "frederick.librarycalendar.com",
        municipality: "frederick",
        category: "community",
      },
      event({
        sourceUrl,
        heroImage,
        heroImageAlt: "Paint and brushes on a table",
      }),
      stats,
    );

    expect(db.begin).not.toHaveBeenCalled();
    expect(db.state().normalized).toMatchObject({
      category: "community",
      sourceUrl,
      heroImage,
      heroImageAlt: "Paint and brushes on a table",
    });
    expect(stats).toMatchObject({
      rawUnchanged: 1,
      normUpserted: 1,
    });
  });

  it("resets coordinates and geocoded_at only when the normalized address changes", async () => {
    const db = transactionalSql({
      initial: {
        raw: {
          id: "raw-event-1",
          dtstamp: "2026-07-01T12:00:00.000Z",
        },
      },
    });
    const incoming = event({
      summary: "Updated event",
      rawLocation: "Test Venue - 20 N Market St Frederick MD 21701",
    });

    await upsertEvent(
      db.sql,
      {
        sourceDomain: "calendar.example",
        municipality: "frederick",
        category: "community",
      },
      incoming,
      emptyStats(),
    );

    const normalizedCall = db.transactions[0].mock.calls.find(([strings]) =>
      queryText(strings).includes("insert into ingested_events"),
    );
    expect(normalizedCall).toBeDefined();
    const text = queryText(normalizedCall![0]);
    expect(
      text.match(
        /ingested_events\.address is distinct from excluded\.address/g,
      ),
    ).toHaveLength(3);
    expect(text).toContain("lat = case");
    expect(text).toContain("lng = case");
    expect(text).toContain("geocoded_at = case");
    expect(normalizedCall!.slice(1)).toContain(
      "20 N Market St Frederick MD 21701",
    );
  });
});
