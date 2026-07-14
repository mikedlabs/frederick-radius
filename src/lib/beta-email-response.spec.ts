import { describe, expect, it } from "vitest";
import { betaInviteWasSent } from "./beta-email-response";

describe("betaInviteWasSent", () => {
  it("accepts an explicitly delivered invite", () => {
    expect(betaInviteWasSent(true, { ok: true, sent: true })).toBe(true);
  });

  it("does not turn a stored-but-unsent request into a Sent state", () => {
    expect(betaInviteWasSent(true, { ok: true, sent: false })).toBe(false);
    expect(betaInviteWasSent(true, { ok: false, sent: false })).toBe(false);
  });

  it("requires a successful HTTP response as well as the delivery flag", () => {
    expect(betaInviteWasSent(false, { ok: true, sent: true })).toBe(false);
  });
});
