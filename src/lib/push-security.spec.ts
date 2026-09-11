import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  guardPushMutation,
  isRecognizedPushEndpoint,
  parsePushSubscription,
  pushJson,
  readPushJson,
} from "./push-security";

function validKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
    auth: Buffer.alloc(16, 7).toString("base64url"),
  };
}

describe("Web Push provider validation", () => {
  it.each([
    "https://fcm.googleapis.com/wp/opaque-token",
    "https://fcm.googleapis.com/fcm/send/opaque-token",
    "https://android.googleapis.com/gcm/send/opaque-token",
    "https://updates.push.services.mozilla.com/wpush/v2/opaque-token",
    "https://push.services.mozilla.com/wpush/v2/opaque-token",
    "https://web.push.apple.com/opaque-token",
    "https://db3.notify.windows.com/?token=opaque-token",
  ])("accepts a recognized browser provider: %s", (endpoint) => {
    expect(isRecognizedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/wp/token",
    "https://127.0.0.1/push",
    "https://[::1]/push",
    "https://169.254.169.254/latest/meta-data",
    "https://push.example.com/send/token",
    "https://fcm.googleapis.com.evil.example/wp/token",
    "https://user:pass@fcm.googleapis.com/wp/token",
    "https://fcm.googleapis.com:8443/wp/token",
    "https://fcm.googleapis.com:443/wp/token",
    "https://fcm.googleapis.com/not-a-web-push-path",
    "https://web.push.apple.com/",
  ])("rejects private, custom, credentialed, ported, or malformed endpoints: %s", (endpoint) => {
    expect(isRecognizedPushEndpoint(endpoint)).toBe(false);
  });
});

describe("PushSubscription key validation", () => {
  it("accepts exact provider, P-256, and auth material", () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/wp/opaque-token",
      keys: validKeys(),
    };
    expect(parsePushSubscription(subscription)).toEqual(subscription);
  });

  it("rejects wrong-sized auth/public keys and off-curve P-256 material", () => {
    const keys = validKeys();
    const endpoint = "https://web.push.apple.com/opaque-token";
    expect(
      parsePushSubscription({ endpoint, keys: { ...keys, auth: Buffer.alloc(15).toString("base64url") } }),
    ).toBeNull();
    expect(
      parsePushSubscription({ endpoint, keys: { ...keys, p256dh: Buffer.alloc(64).toString("base64url") } }),
    ).toBeNull();
    const offCurve = Buffer.alloc(65);
    offCurve[0] = 0x04;
    expect(
      parsePushSubscription({ endpoint, keys: { ...keys, p256dh: offCurve.toString("base64url") } }),
    ).toBeNull();
  });
});

describe("push request controls", () => {
  it("rejects a foreign mutation source", async () => {
    const request = new Request("https://frederickradius.app/api/push/subscribe", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    const response = await guardPushMutation(request, "push-origin-test", 10, 60);
    expect(response?.status).toBe(403);
    expect(response?.headers.get("cache-control")).toContain("no-store");
  });

  it("uses the per-instance rate-limit fallback when durable KV is absent", async () => {
    const oldUrl = process.env.KV_REST_API_URL;
    const oldToken = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    try {
      const request = () =>
        new Request("https://frederickradius.app/api/push/test", {
          method: "POST",
          headers: {
            origin: "https://frederickradius.app",
            "x-forwarded-for": "203.0.113.210",
          },
        });
      const bucket = `push-fallback-${Date.now()}`;
      await expect(guardPushMutation(request(), bucket, 2, 60)).resolves.toBeNull();
      await expect(guardPushMutation(request(), bucket, 2, 60)).resolves.toBeNull();
      const limited = await guardPushMutation(request(), bucket, 2, 60);
      expect(limited?.status).toBe(429);
      expect(limited?.headers.get("retry-after")).toBe("60");
    } finally {
      if (oldUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = oldUrl;
      if (oldToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = oldToken;
    }
  });

  it("rejects an oversized JSON body before reading it", async () => {
    const request = new Request("https://frederickradius.app/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "9000" },
      body: "{}",
    });
    const result = await readPushJson(request, 8 * 1024);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected body rejection");
    expect(result.response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it("marks every helper response no-store", () => {
    expect(pushJson({ ok: true }).headers.get("cache-control")).toContain("no-store");
  });
});
