import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import {
  MAX_FAIR_PACK_BYTES,
  computeFairPackRevision,
  fairPackSchema,
  parseFairPackText,
  verifyFairPackRevision,
  type FairPack,
} from "@/lib/fair/pack";
import { parseGreatFrederickFair2026Schedule } from "@/lib/fair/schedule";

const releasePath = resolve(
  process.cwd(),
  `public${greatFrederickFair2026PackPointer.assetPath}`,
);
const releaseText = readFileSync(releasePath, "utf8");
const fixture = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/fair/__fixtures__/great-frederick-fair-2026.ics",
  ),
  "utf8",
);

function clonePack(): FairPack {
  return structuredClone(greatFrederickFair2026Pack);
}

describe("Great Frederick Fair static pack", () => {
  it("contains all nine days and 190 rows once, nested under their days", () => {
    const rows = greatFrederickFair2026Pack.schedule.days.flatMap(
      (day) => day.items,
    );
    expect(greatFrederickFair2026Pack.schedule.days).toHaveLength(9);
    expect(rows).toHaveLength(190);
    expect(new Set(rows.map((row) => row.id)).size).toBe(190);
    expect(greatFrederickFair2026Pack.manifest.scheduleItems).toEqual([]);
    expect("items" in greatFrederickFair2026Pack.schedule).toBe(false);
  });

  it("matches the fail-closed reviewed calendar adapter exactly", () => {
    const parsed = parseGreatFrederickFair2026Schedule(fixture);
    expect(parsed.ok).toBe(true);
    expect(greatFrederickFair2026Pack.schedule.source.sourceRevision).toBe(
      parsed.sourceRevision,
    );
    expect(greatFrederickFair2026Pack.schedule.stats).toEqual(parsed.stats);
    expect(greatFrederickFair2026Pack.schedule.days).toEqual(parsed.days);
  });

  it("has deterministic content identity and an exact immutable pointer", async () => {
    const { revision, ...payload } = greatFrederickFair2026Pack;
    expect(await computeFairPackRevision(payload)).toBe(revision);
    expect(await verifyFairPackRevision(greatFrederickFair2026Pack)).toBe(true);
    expect(await parseFairPackText(releaseText)).toEqual(
      greatFrederickFair2026Pack,
    );
    expect(greatFrederickFair2026PackPointer).toMatchObject({
      revision,
      dayCount: 9,
      itemCount: 190,
      assetPath: `/fair/2026/releases/${revision.slice("sha256:".length)}.json`,
      byteLength: new TextEncoder().encode(releaseText).byteLength,
    });
  });

  it("keeps source provenance exact for every component", () => {
    const pack = greatFrederickFair2026Pack;
    expect(pack.provenance.scheduleSourceUrl).toBe(
      pack.schedule.source.sourceUrl,
    );
    expect(pack.provenance.scheduleSourceRevision).toBe(
      pack.schedule.source.sourceRevision,
    );
    expect(pack.provenance.transitSourceUrl).toBe(
      pack.transit.evidenceState.sourceUrl,
    );
    expect(pack.provenance.transitFetchedOn).toBe(
      pack.transit.evidenceState.sourceFetchedOn,
    );
    expect(pack.offers.every((offer) => offer.provenance.length > 0)).toBe(true);
  });

  it("stays comfortably below the offline asset cap", () => {
    const byteLength = new TextEncoder().encode(releaseText).byteLength;
    expect(byteLength).toBe(greatFrederickFair2026PackPointer.byteLength);
    expect(byteLength).toBeLessThan(MAX_FAIR_PACK_BYTES);
  });

  it("rejects duplicated, flattened, partial, and internally inconsistent data", () => {
    const duplicate = clonePack();
    duplicate.schedule.days[0].items[1].id =
      duplicate.schedule.days[0].items[0].id;
    expect(fairPackSchema.safeParse(duplicate).success).toBe(false);

    const partial = clonePack();
    partial.schedule.days.pop();
    expect(fairPackSchema.safeParse(partial).success).toBe(false);

    const flattened = {
      ...clonePack(),
      schedule: {
        ...clonePack().schedule,
        items: clonePack().schedule.days.flatMap((day) => day.items),
      },
    };
    expect(fairPackSchema.safeParse(flattened).success).toBe(false);

    const falseTransitClaim = clonePack();
    (falseTransitClaim.transit.evidenceState as unknown as Record<string, unknown>)[
      "includesArrivalTimes"
    ] = true;
    expect(fairPackSchema.safeParse(falseTransitClaim).success).toBe(false);
  });

  it("rejects a well-shaped pack when its content no longer matches the hash", async () => {
    const changed = clonePack();
    changed.schedule.days[0].items[0].text = "Changed after release";
    expect(fairPackSchema.safeParse(changed).success).toBe(true);
    expect(await verifyFairPackRevision(changed)).toBe(false);
    await expect(parseFairPackText(JSON.stringify(changed))).rejects.toThrow(
      "revision does not match",
    );
  });

  it("rejects oversized downloads before parsing JSON", async () => {
    await expect(
      parseFairPackText(" ".repeat(MAX_FAIR_PACK_BYTES + 1)),
    ).rejects.toThrow("download limit");
  });
});
