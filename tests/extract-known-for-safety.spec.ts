import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/extract-known-for.mjs");
const OUTPUT = resolve(ROOT, "src/data/known-for.json");

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_OIDC_TOKEN: "",
      GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL: "",
      GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED: "0",
    },
  });
}

describe("known-for paid maintenance safety", () => {
  it("keeps one candidate to one bounded provider attempt", () => {
    const source = readFileSync(SCRIPT, "utf8");

    expect(source).toContain("maxRetries: 0");
    expect(source).toContain("maxOutputTokens: 256");
    expect(source).toContain("AbortSignal.timeout(20_000)");
  });

  it("previews by default without a credential, model call, or file change", () => {
    const before = readFileSync(OUTPUT, "utf8");
    const result = run(["--limit=2"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Planning 2 place(s)");
    expect(result.stdout).toContain("DRY RUN — no model calls and no files changed.");
    expect(readFileSync(OUTPUT, "utf8")).toBe(before);
  });

  it("requires an explicit finite ceiling before checking credentials", () => {
    const result = run(["--live", "--confirm"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires an explicit --limit N ceiling");
  });

  it("keeps an otherwise valid live run on the Google policy hold", () => {
    const result = run(["--live", "--confirm", "--limit=2"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Google-derived tag extraction is on policy hold");
  });

  it.each(["--limit=2oops", "--limit=251", "--unknown"])(
    "rejects malformed or unbounded paid scope: %s",
    (arg) => {
      const result = run([arg]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/positive whole number|250-call ceiling|Unknown option/);
    },
  );
});
