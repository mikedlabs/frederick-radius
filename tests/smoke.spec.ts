import { describe, it, expect } from "vitest";
import { easternWallToUtcISO } from "@/lib/tz";

/**
 * Vitest smoke test. Proves the runner works, the @ path alias resolves,
 * and TypeScript source under src is importable. Real coverage lives in
 * the per-ticket spec files (P0-1 onward).
 */
describe("test infrastructure", () => {
  it("runs vitest and resolves the @ alias", () => {
    expect(1 + 1).toBe(2);
  });

  it("can import application source via @/", () => {
    const iso = easternWallToUtcISO(2026, 5, 17, 0, 0, 0);
    expect(typeof iso).toBe("string");
    expect(iso.endsWith("Z")).toBe(true);
  });
});
