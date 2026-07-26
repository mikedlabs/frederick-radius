import { describe, expect, it } from "vitest";
import { chunkArchiveRows, dedupeArchiveRows } from "./incidentArchive";

describe("scanner archive batching", () => {
  it("keeps only the first row for each incident key", () => {
    const rows = [
      { dedupe_key: "fire|Market St|1", value: "page" },
      { dedupe_key: "fire|Market St|1", value: "live" },
      { dedupe_key: "crash|Patrick St|2", value: "live" },
    ];

    expect(dedupeArchiveRows(rows)).toEqual([rows[0], rows[2]]);
  });

  it("splits a large feed into bounded database writes", () => {
    const rows = Array.from({ length: 251 }, (_, index) => index);

    expect(chunkArchiveRows(rows, 100).map((batch) => batch.length)).toEqual([
      100, 100, 51,
    ]);
  });

  it("uses a safe default for an invalid batch size", () => {
    const rows = Array.from({ length: 101 }, (_, index) => index);

    expect(chunkArchiveRows(rows, 0).map((batch) => batch.length)).toEqual([100, 1]);
  });
});
