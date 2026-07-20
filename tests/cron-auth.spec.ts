import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyCronAuth } from "@/app/api/ingest/_auth";

/**
 * The cron layer's auth is load-bearing: every cron delivers a real side
 * effect (opens a GitHub issue, sends email, writes the DB, fans out push),
 * so an unguarded route is a spam/abuse vector reachable by anyone who knows
 * the URL. This suite is the guard that would have caught the once-
 * unauthenticated weekly-digest route: it verifies the primitive itself, and
 * that every cron route actually calls it.
 */

const CRON_DIR = join(process.cwd(), "src/app/api/cron");
const cronRoutes = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(CRON_DIR, e.name, "route.ts")))
  .map((e) => e.name)
  .sort();

describe("verifyCronAuth", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("fails closed with a 500 when CRON_SECRET is unconfigured", () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronAuth(new Request("https://x/api/cron/x"));
    expect(res?.status).toBe(500);
  });

  it("rejects a request with no Authorization header", () => {
    process.env.CRON_SECRET = "s3cret-token";
    expect(verifyCronAuth(new Request("https://x"))?.status).toBe(401);
  });

  it("rejects a wrong bearer token", () => {
    process.env.CRON_SECRET = "s3cret-token";
    const req = new Request("https://x", { headers: { authorization: "Bearer nope" } });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("rejects a token that is a prefix of the secret (constant-time, length-guarded)", () => {
    process.env.CRON_SECRET = "s3cret-token";
    const req = new Request("https://x", { headers: { authorization: "Bearer s3cret" } });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("passes (returns null) with the correct bearer token", () => {
    process.env.CRON_SECRET = "s3cret-token";
    const req = new Request("https://x", { headers: { authorization: "Bearer s3cret-token" } });
    expect(verifyCronAuth(req)).toBeNull();
  });
});

describe("every cron route is auth-guarded", () => {
  it("discovers the cron routes", () => {
    // A sanity floor so a globbing regression can't quietly empty this suite.
    expect(cronRoutes.length).toBeGreaterThanOrEqual(14);
  });

  it.each(cronRoutes)("%s calls verifyCronAuth", (route) => {
    const src = readFileSync(join(CRON_DIR, route, "route.ts"), "utf8");
    expect(src, `src/app/api/cron/${route}/route.ts must call verifyCronAuth`).toMatch(
      /verifyCronAuth\s*\(/,
    );
  });
});
