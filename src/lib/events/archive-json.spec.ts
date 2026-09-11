import { describe, expect, it } from "vitest";
import { archiveJsonText } from "./archive-json";

describe("event archive JSON transport", () => {
  it("turns nested archive arrays into JSON text for the raw Postgres client", () => {
    const payload = [
      {
        source: "celebrate",
        source_uid: "alive-0806",
        snapshot: { status: "cancelled", audience: [] },
      },
    ];

    const serialized = archiveJsonText(payload);

    expect(serialized).toBeTypeOf("string");
    expect(JSON.parse(serialized)).toEqual(payload);
  });

  it("rejects a root value that JSON cannot encode", () => {
    expect(() => archiveJsonText(undefined)).toThrow(
      "Event archive JSON must be serializable.",
    );
  });
});
