import { createECDH } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
}));

import { hasCompleteVapidConfiguration, sendPush } from "./push";
import { WEB_PUSH_TIMEOUT_MS } from "./push-security";

describe("sendPush outbound boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "test-public";
    process.env.VAPID_PRIVATE_KEY = "test-private";
    process.env.VAPID_SUBJECT = "mailto:owner@frederickradius.app";
    mocks.sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: "" });
  });

  it("passes a socket-destroying timeout to web-push", async () => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = {
      endpoint: "https://fcm.googleapis.com/wp/opaque-token",
      keys: {
        p256dh: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
        auth: Buffer.alloc(16, 3).toString("base64url"),
      },
    };

    await sendPush(sub, { title: "Test", body: "Hello" });

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      sub,
      JSON.stringify({ title: "Test", body: "Hello" }),
      { timeout: WEB_PUSH_TIMEOUT_MS },
    );
  });

  it("refuses an unrecognized endpoint before web-push can make a request", async () => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    await expect(
      sendPush(
        {
          endpoint: "https://127.0.0.1/internal",
          keys: {
            p256dh: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
            auth: Buffer.alloc(16, 3).toString("base64url"),
          },
        },
        { title: "Test", body: "Hello" },
      ),
    ).rejects.toThrow("invalid_subscription");
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only VAPID value as unconfigured", () => {
    process.env.VAPID_PRIVATE_KEY = "   ";

    expect(hasCompleteVapidConfiguration()).toBe(false);
  });
});
