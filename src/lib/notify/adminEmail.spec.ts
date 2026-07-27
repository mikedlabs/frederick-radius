import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAdminEmail } from "./adminEmail";

/**
 * These lock the contract that matters: a notification must never be able to
 * break the request that triggered it. Every failure mode returns false rather
 * than throwing, because the caller has already stored the durable row and the
 * person on the other end is finished either way.
 */

const ENV = { ...process.env };

function jsonOk() {
  return Promise.resolve({ ok: true, status: 200 } as Response);
}

describe("sendAdminEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.ADMIN_EMAIL;
    delete process.env.RESEND_FROM;
  });
  afterEach(() => {
    process.env = { ...ENV };
    vi.restoreAllMocks();
  });

  it("does nothing when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendAdminEmail({ subject: "s", text: "t", tag: "test" })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports failure instead of throwing when the API rejects the message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 422 } as Response);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendAdminEmail({ subject: "s", text: "t", tag: "test" })).toBe(false);
  });

  it("reports failure instead of throwing when the network is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendAdminEmail({ subject: "s", text: "t", tag: "test" })).toBe(false);
  });

  it("sends to the configured owner inbox with the supplied subject and body", async () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(jsonOk);

    expect(
      await sendAdminEmail({ subject: "Food-truck claim: Fryday", text: "body", tag: "test" }),
    ).toBe(true);

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.to).toBe("owner@example.com");
    expect(body.subject).toBe("Food-truck claim: Fryday");
    expect(body.text).toBe("body");
  });

  it("falls back when RESEND_FROM is set to an empty string", async () => {
    // This exact misconfiguration has shipped to prod before, and an empty
    // from-address is rejected by the API, so `||` is load-bearing here.
    process.env.RESEND_FROM = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(jsonOk);
    await sendAdminEmail({ subject: "s", text: "t", tag: "test" });
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.from).toContain("@frederickradius.app");
  });

  it("lets a caller override the sender without touching the others", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(jsonOk);
    await sendAdminEmail({ subject: "s", text: "t", tag: "test", from: "X <x@frederickradius.app>" });
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.from).toBe("X <x@frederickradius.app>");
  });
});
