import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const segment = path.join(
  process.cwd(),
  "src/app/(app)/events/[slug]",
);

describe("event detail transient-failure contract", () => {
  it("keeps timeouts distinct from true 404s and offers recovery", () => {
    const source = readFileSync(path.join(segment, "error.tsx"), "utf8");

    expect(source).toContain("This event could not be confirmed yet.");
    expect(source).toContain("onClick={reset}");
    expect(source).toContain('href="/events"');
    expect(source).toContain("Sentry.captureException(error)");
  });

  it("does not add a loading boundary that would turn unknown slugs into soft 404s", () => {
    expect(() =>
      readFileSync(path.join(segment, "loading.tsx"), "utf8"),
    ).toThrow();
  });
});
