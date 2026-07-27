import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("compact business photo surfaces", () => {
  it("keeps the saved wallet lockup connected to place media", () => {
    const source = read("src/components/saved/SavedWallet.tsx");

    expect(source.match(/<PlaceMedallion\b/g)).toHaveLength(1);
    expect(source).toContain("place={place}");
    expect(source).toContain('surface="inverse"');
  });

  it("keeps every Places to play group connected to place media", () => {
    const source = read("src/app/(app)/sports/page.tsx");

    expect(source.match(/leading=\{<PlaceMedallion place=\{p\} \/>}/g)).toHaveLength(3);
  });
});
