import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeCode, signCode, verifyCodeCookie } from "./beta-gate";

/**
 * The signed-code layer is the whole security story for per-user access codes:
 * the edge middleware trusts a cookie WITHOUT a DB check, so the signature must
 * round-trip, must recover the exact code, and must reject any tampering.
 */
describe("beta access codes", () => {
  const prev = process.env.BETA_CODE_SECRET;
  beforeEach(() => {
    process.env.BETA_CODE_SECRET = "test-secret-key";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.BETA_CODE_SECRET;
    else process.env.BETA_CODE_SECRET = prev;
  });

  it("normalizes submitted codes to a stable slug", () => {
    expect(normalizeCode("  Frederick-ADA7 ")).toBe("frederick-ada7");
    expect(normalizeCode("jane at the coop")).toBe("jane-at-the-coop");
  });

  it("round-trips a signed cookie back to its code", async () => {
    const cookie = await signCode("frederick-ada7");
    expect(cookie).toBeTruthy();
    expect(await verifyCodeCookie(cookie!)).toBe("frederick-ada7");
  });

  it("rejects a tampered signature", async () => {
    const cookie = await signCode("frederick-ada7");
    const tampered = cookie!.slice(0, -1) + (cookie!.endsWith("a") ? "b" : "a");
    expect(await verifyCodeCookie(tampered)).toBeNull();
  });

  it("rejects a swapped code with a stale signature", async () => {
    const cookie = await signCode("frederick-ada7");
    const sig = cookie!.split("~")[1];
    expect(await verifyCodeCookie(`frederick-evil~${sig}`)).toBeNull();
  });

  it("rejects malformed and empty cookies", async () => {
    expect(await verifyCodeCookie(undefined)).toBeNull();
    expect(await verifyCodeCookie("")).toBeNull();
    expect(await verifyCodeCookie("no-separator")).toBeNull();
    expect(await verifyCodeCookie("~onlysig")).toBeNull();
  });

  it("does not validate cookies once the secret is rotated", async () => {
    const cookie = await signCode("frederick-ada7");
    process.env.BETA_CODE_SECRET = "rotated-secret";
    expect(await verifyCodeCookie(cookie!)).toBeNull();
  });
});
