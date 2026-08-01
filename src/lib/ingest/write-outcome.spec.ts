import { describe, expect, it } from "vitest";
import {
  safeIngestWriteError,
  summarizeIngestWriteFailures,
} from "./write-outcome";

describe("ingest write outcome", () => {
  it("distinguishes partial and total write failure", () => {
    expect(
      summarizeIngestWriteFailures({ attempted: 10, failed: 2 }),
    ).toEqual({
      status: "partial",
      error: "2 of 10 event writes failed",
    });
    expect(
      summarizeIngestWriteFailures({ attempted: 9, failed: 9 }),
    ).toEqual({
      status: "error",
      error: "all 9 event writes failed",
    });
  });

  it("preserves useful diagnostics while redacting credentials and tokens", () => {
    const safe = safeIngestWriteError(
      new Error(
        'column "location_key" does not exist; DATABASE_URL=postgres://radius:password@example.test/radius Bearer abcdefghijklmnop',
      ),
    );

    expect(safe).toContain('column "location_key" does not exist');
    expect(safe).toContain("DATABASE_URL=[redacted]");
    expect(safe).toContain("Bearer [redacted]");
    expect(safe).not.toContain("password");
    expect(safe).not.toContain("abcdefghijklmnop");
    expect(safe).not.toContain("postgres://");
  });
});
