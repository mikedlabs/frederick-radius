import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync("package.json", "utf8"),
) as PackageJson;
const scripts = packageJson.scripts ?? {};

describe("local command data safety", () => {
  it.each(["predev", "pretest:watch"])(
    "%s validates the promoted release without regenerating it",
    (name) => {
      expect(scripts[name]).toContain("data:release:check");
      expect(scripts[name]).not.toContain("build:client-places");
    },
  );

  it("keeps tracked-data regeneration behind explicit command names", () => {
    expect(scripts["dev:refresh-data"]).toContain("build:client-places");
    expect(scripts["test:watch:refresh-data"]).toContain(
      "build:client-places",
    );
  });

  it("makes the normal complete test command include Node helper contracts", () => {
    expect(scripts["test:all"]).toContain("test:helpers");
    expect(scripts["test:helpers"]).toContain("scripts/lib/*.test.mjs");
    expect(scripts["test:helpers"]).toContain("tests/*.test.mjs");
  });

  it("does not let the Playwright server bypass the package-level safety check", () => {
    const config = readFileSync("playwright.config.ts", "utf8");
    expect(config).toContain("`npm run dev -- -p ${PORT}`");
    expect(config).not.toContain("PW_SKIP_PREDEV");
  });

  it("never captures a visual baseline from an unrelated reused server", () => {
    const config = readFileSync("playwright.config.ts", "utf8");
    expect(config).toContain("!VISUAL_CONTRACT");
    expect(config).toContain("VISUAL_CONTRACT ? 3110 : 3010");
  });
});
