import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { getIngestedSeries } from "./ingested";
import { ingestedSeriesToCards } from "./ingestedEvents";

describe("multi-day all-day ingested visibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T16:00:00.000Z")); // noon ET, day two
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads an occurrence whose start is before the six-hour cutoff and keeps it on day two", async () => {
    const sql = vi.fn(
      async (_strings: TemplateStringsArray, ..._values: unknown[]) => [
        {
          source_uid: "festival-1",
          source_domain: "fcvfra.com",
          source_url: "https://events.example/festival",
          title: "Summer Festival",
          description: "A two-day community festival.",
          starts_at_utc: "2026-07-10T04:00:00.000Z",
          ends_at_utc: "2026-07-12T04:00:00.000Z",
          all_day: true,
          venue_name: "Baker Park",
          address: "121 N Bentz St, Frederick, MD 21701",
          lat: "39.4143",
          lng: "-77.4200",
          municipality: "frederick",
          category: "community",
        },
      ],
    );
    mocks.getSql.mockReturnValue(sql);

    const series = await getIngestedSeries();
    const query = (sql.mock.calls[0]?.[0] as unknown as TemplateStringsArray).join(" ");
    expect(query).toMatch(
      /where starts_at_utc >=\s+or ends_at_utc >=/,
    );

    const cards = ingestedSeriesToCards(series, new Date());
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Summer Festival",
      starts_at: "2026-07-10T04:00:00.000Z",
      ends_at: "2026-07-12T04:00:00.000Z",
      is_all_day: true,
    });
  });
});
