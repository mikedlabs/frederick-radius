import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/places", () => ({ PLACES: [] }));

import {
  reconcilePublishedGeocodes,
  VERIFIED_CATALOG_CACHE_SOURCE,
  VERIFIED_GOOGLE_CACHE_SOURCE,
} from "@/lib/ingest/geocode";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

describe("reconcilePublishedGeocodes", () => {
  it("anchors current pins to trusted cache provenance and clears everything else", async () => {
    const sql = vi.fn().mockResolvedValue([
      { revalidated: "27", repaired: "2", cleared: "11" },
    ]);

    const result = await reconcilePublishedGeocodes(sql as never);

    expect(result).toEqual({ revalidated: 27, repaired: 2, cleared: 11 });
    const [strings, ...values] = sql.mock.calls[0];
    const text = queryText(strings as TemplateStringsArray);
    expect(text).toContain("cache.source in");
    expect(text).toContain("update public.ingested_events");
    expect(text).toContain(
      "coalesce(e.ends_at_utc, e.starts_at_utc) >= now() - interval '6 hours'",
    );
    expect(text).toContain(
      "geocoded_at = case when published.trusted then e.geocoded_at else null end",
    );
    expect(text).toContain("or e.lat is distinct from published.cache_lat");
    expect(values).toEqual([
      VERIFIED_CATALOG_CACHE_SOURCE,
      VERIFIED_GOOGLE_CACHE_SOURCE,
    ]);
  });

  it("reports zeroes when no current event pins exist", async () => {
    const sql = vi.fn().mockResolvedValue([]);

    await expect(reconcilePublishedGeocodes(sql as never)).resolves.toEqual({
      revalidated: 0,
      repaired: 0,
      cleared: 0,
    });
  });
});
