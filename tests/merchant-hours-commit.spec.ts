import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitMerchantHours } from "../scripts/lib/commit-merchant-hours";

describe("shared collector / batch commit boundary", () => {
  it("preserves a newer artifact, existing writer lock, and older staged evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "hours-commit-")), file = join(directory, "hours.json");
    const artifact = { schema_version: 1 as const, places: [], review: [] };
    try {
      writeFileSync(file, "newer collector bytes");
      expect(() => commitMerchantHours(file, "old review bytes", artifact)).toThrow(/changed/);
      expect(readFileSync(file, "utf8")).toBe("newer collector bytes");
      expect(existsSync(`${file}.review.lock`)).toBe(false);
      writeFileSync(`${file}.review.lock`, "active writer");
      expect(() => commitMerchantHours(file, "newer collector bytes", artifact)).toThrow();
      expect(readFileSync(`${file}.review.lock`, "utf8")).toBe("active writer");
      rmSync(`${file}.review.lock`); writeFileSync(`${file}.review.tmp`, "older staged evidence");
      expect(() => commitMerchantHours(file, "newer collector bytes", artifact)).toThrow();
      expect(readFileSync(`${file}.review.tmp`, "utf8")).toBe("older staged evidence");
      expect(readFileSync(file, "utf8")).toBe("newer collector bytes");
      expect(existsSync(`${file}.review.lock`)).toBe(false);
      rmSync(`${file}.review.tmp`); commitMerchantHours(file, "newer collector bytes", artifact);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(artifact);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
