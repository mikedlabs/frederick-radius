import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("beta access return action", () => {
  it("labels the lower mobile link as navigation back to the code field", () => {
    const source = readFileSync("src/app/beta/page.tsx", "utf8");
    expect(source).toContain('href="#beta-access"');
    expect(source).toContain("Back to access code");
    expect(source).not.toMatch(
      /href="#beta-access"[\s\S]{0,900}>\s*Enter Radius\s*</,
    );
  });
});
