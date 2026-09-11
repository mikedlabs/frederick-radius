import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("business photo payload boundaries", () => {
  it("keeps the photo-rich place catalog out of the Rhythm client", () => {
    const field = read("src/components/rhythm/RhythmField.tsx");
    const shared = read("src/lib/rhythm-shared.ts");

    expect(field).toContain('from "@/lib/rhythm-shared"');
    expect(field).not.toContain('from "@/lib/rhythm"');
    expect(shared).not.toContain("places-client");
    expect(shared).not.toContain("places-client.json");
  });
});
