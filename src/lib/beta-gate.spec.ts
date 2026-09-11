import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BETA_CODE_SESSION_SECONDS,
  isRedeemableBetaCode,
  isValidMemberId,
  normalizeCode,
  signCode,
  signMemberId,
  verifyCodeCookie,
  verifyMemberCookie,
} from "./beta-gate";

/**
 * The signed-code layer is the whole security story for per-user access codes:
 * the edge middleware trusts a cookie WITHOUT a DB check, so the signature must
 * round-trip, must recover the exact code, and must reject any tampering.
 */
describe("beta access codes", () => {
  const prev = process.env.BETA_CODE_SECRET;
  const previousPrev = process.env.BETA_CODE_SECRET_PREVIOUS;
  beforeEach(() => {
    process.env.BETA_CODE_SECRET = "test-secret-key";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.BETA_CODE_SECRET;
    else process.env.BETA_CODE_SECRET = prev;
    if (previousPrev === undefined) delete process.env.BETA_CODE_SECRET_PREVIOUS;
    else process.env.BETA_CODE_SECRET_PREVIOUS = previousPrev;
  });

  it("normalizes submitted codes to a stable slug", () => {
    expect(normalizeCode("  Frederick-ADA7 ")).toBe("frederick-ada7");
    expect(normalizeCode("jane at the coop")).toBe("jane-at-the-coop");
  });

  it("round-trips a signed cookie back to its code", async () => {
    const now = Date.UTC(2026, 6, 15, 12);
    const cookie = await signCode("frederick-ada7", now);
    expect(cookie).toBeTruthy();
    expect(await verifyCodeCookie(cookie!, now)).toBe("frederick-ada7");
  });

  it("rejects a tampered signature", async () => {
    const cookie = await signCode("frederick-ada7");
    const tampered = cookie!.slice(0, -1) + (cookie!.endsWith("a") ? "b" : "a");
    expect(await verifyCodeCookie(tampered)).toBeNull();
  });

  it("rejects a swapped code with a stale signature", async () => {
    const cookie = await signCode("frederick-ada7");
    const [version, issued, , sig] = cookie!.split("~");
    expect(await verifyCodeCookie(`${version}~${issued}~frederick-evil~${sig}`)).toBeNull();
  });

  it("rejects malformed and empty cookies", async () => {
    expect(await verifyCodeCookie(undefined)).toBeNull();
    expect(await verifyCodeCookie("")).toBeNull();
    expect(await verifyCodeCookie("no-separator")).toBeNull();
    expect(await verifyCodeCookie("v2~onlysig")).toBeNull();
  });

  it("expires personal-code sessions after 12 hours", async () => {
    const issued = Date.UTC(2026, 6, 15, 12);
    const cookie = await signCode("frederick-ada7", issued);
    expect(await verifyCodeCookie(cookie!, issued + BETA_CODE_SESSION_SECONDS * 1_000)).toBe(
      "frederick-ada7",
    );
    expect(
      await verifyCodeCookie(cookie!, issued + (BETA_CODE_SESSION_SECONDS + 1) * 1_000),
    ).toBeNull();
  });

  it("supports a previous secret only during a planned rotation", async () => {
    const now = Date.UTC(2026, 6, 15, 12);
    const cookie = await signCode("frederick-ada7", now);
    process.env.BETA_CODE_SECRET = "rotated-secret";
    expect(await verifyCodeCookie(cookie!, now)).toBeNull();
    process.env.BETA_CODE_SECRET_PREVIOUS = "test-secret-key";
    expect(await verifyCodeCookie(cookie!, now)).toBe("frederick-ada7");
  });

  it("rejects legacy non-expiring cookie formats", async () => {
    expect(await verifyCodeCookie("frederick-ada7~deadbeef")).toBeNull();
  });

  it("does not mint or renew a session for a revoked code", () => {
    expect(isRedeemableBetaCode({ revoked: false })).toBe(true);
    expect(isRedeemableBetaCode({ revoked: true })).toBe(false);
    expect(isRedeemableBetaCode(null)).toBe(false);
  });
});

/**
 * The signed member cookie carries an anonymous NFC member id. It grants no
 * access on its own, but the analytics ingest trusts it to attribute events, so
 * it must round-trip, reject tampering, and survive a dedicated-secret rollout.
 */
describe("member cookie", () => {
  const prev = process.env.BETA_CODE_SECRET;
  const prevMember = process.env.MEMBER_COOKIE_SECRET;
  beforeEach(() => {
    process.env.BETA_CODE_SECRET = "test-secret-key";
    delete process.env.MEMBER_COOKIE_SECRET;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.BETA_CODE_SECRET;
    else process.env.BETA_CODE_SECRET = prev;
    if (prevMember === undefined) delete process.env.MEMBER_COOKIE_SECRET;
    else process.env.MEMBER_COOKIE_SECRET = prevMember;
  });

  const ID = "member-abcdef-012345";

  it("validates the member id shape", () => {
    expect(isValidMemberId(ID)).toBe(true);
    expect(isValidMemberId("too-short")).toBe(false);
    expect(isValidMemberId("has spaces and!chars")).toBe(false);
  });

  it("round-trips a signed id and recovers it", async () => {
    const signed = await signMemberId(ID);
    expect(signed).toMatch(/^m1~member-abcdef-012345~[a-f0-9]{32}$/);
    expect(await verifyMemberCookie(signed!)).toBe(ID);
  });

  it("rejects a tampered signature and an unsigned value", async () => {
    const signed = (await signMemberId(ID))!;
    const tampered = signed.slice(0, -1) + (signed.endsWith("0") ? "1" : "0");
    expect(await verifyMemberCookie(tampered)).toBeNull();
    expect(await verifyMemberCookie("m1~member-abcdef-012345~deadbeefdeadbeefdeadbeefdeadbeef")).toBeNull();
    expect(await verifyMemberCookie(undefined)).toBeNull();
  });

  it("accepts a cookie minted under the code secret after a dedicated secret is introduced", async () => {
    // Minted with only the code secret set (the zero-config default).
    const signed = (await signMemberId(ID))!;
    // Owner later splits off a dedicated member secret — existing cookies must
    // still verify (the code secret stays in the verification set).
    process.env.MEMBER_COOKIE_SECRET = "a-separate-member-secret";
    expect(await verifyMemberCookie(signed)).toBe(ID);
    // And a freshly minted cookie now uses the dedicated secret.
    const fresh = (await signMemberId(ID))!;
    expect(await verifyMemberCookie(fresh)).toBe(ID);
  });
});
