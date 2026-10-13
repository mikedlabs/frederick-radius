import { createECDH } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));

import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { GET as publicKey } from "@/app/api/push/public-key/route";
import { POST as sendTest } from "@/app/api/push/test/route";

const ENDPOINT = "https://fcm.googleapis.com/wp/opaque-token";

function subscription() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: ENDPOINT,
    keys: {
      p256dh: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
      auth: Buffer.alloc(16, 9).toString("base64url"),
    },
  };
}

function mutation(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`https://frederickradius.app${path}`, {
    method: "POST",
    headers: {
      origin: "https://frederickradius.app",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("push API security boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(null);
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("rejects foreign subscribe requests before body or DB work", async () => {
    const request = mutation("/api/push/subscribe", {}, { origin: "https://evil.example" });
    const response = await subscribe(request);
    expect(response.status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects declared oversized subscribe bodies before DB work", async () => {
    const request = mutation("/api/push/subscribe", {}, { "content-length": "9000" });
    const response = await subscribe(request);
    expect(response.status).toBe(413);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it("uses subscription keys as atomic proof on endpoint conflicts", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    mocks.getDb.mockReturnValue({ insert: vi.fn(() => ({ values })) });

    const response = await subscribe(
      mutation("/api/push/subscribe", { subscription: subscription(), topics: ["civic-alerts"] }),
    );

    expect(response.status).toBe(409);
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ setWhere: expect.anything() }),
    );
    expect(await response.json()).toEqual({ error: "Subscription ownership check failed." });
  });

  it("limits test sends to three attempts per IP per hour", async () => {
    const request = () =>
      mutation(
        "/api/push/test",
        { endpoint: ENDPOINT },
        { "x-forwarded-for": "203.0.113.211" },
      );
    expect((await sendTest(request())).status).toBe(503);
    expect((await sendTest(request())).status).toBe(503);
    expect((await sendTest(request())).status).toBe(503);
    const response = await sendTest(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("marks the public-key response no-store", async () => {
    const response = await publicKey(
      new Request("https://frederickradius.app/api/push/public-key", {
        headers: { referer: "https://frederickradius.app/settings/notifications" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([
    ["only the public key", "public-key", undefined, undefined],
    ["a missing private key", "public-key", undefined, "mailto:owner@example.com"],
    ["a whitespace private key", "public-key", "   ", "mailto:owner@example.com"],
    ["a missing subject", "public-key", "private-key", undefined],
  ])(
    "does not advertise push when VAPID has %s",
    async (_label, publicValue, privateValue, subjectValue) => {
      if (publicValue !== undefined) process.env.VAPID_PUBLIC_KEY = publicValue;
      if (privateValue !== undefined) process.env.VAPID_PRIVATE_KEY = privateValue;
      if (subjectValue !== undefined) process.env.VAPID_SUBJECT = subjectValue;

      const response = await publicKey(
        new Request("https://frederickradius.app/api/push/public-key", {
          headers: {
            referer:
              "https://frederickradius.app/settings/notifications",
          },
        }),
      );

      expect(await response.json()).toEqual({ key: null, enabled: false });
    },
  );

  it("returns the trimmed public key only when the complete VAPID set exists", async () => {
    process.env.VAPID_PUBLIC_KEY = " public-key ";
    process.env.VAPID_PRIVATE_KEY = " private-key ";
    process.env.VAPID_SUBJECT = " mailto:owner@example.com ";

    const response = await publicKey(
      new Request("https://frederickradius.app/api/push/public-key", {
        headers: {
          referer: "https://frederickradius.app/settings/notifications",
        },
      }),
    );

    expect(await response.json()).toEqual({
      key: "public-key",
      enabled: true,
    });
  });
});
