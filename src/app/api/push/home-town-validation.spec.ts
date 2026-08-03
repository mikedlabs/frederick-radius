import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  guardPushMutation: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/push-security", () => ({
  PUSH_BODY_LIMITS: { subscribe: 8 * 1024, prefs: 4 * 1024 },
  guardPushMutation: mocks.guardPushMutation,
  guardPushRead: vi.fn().mockResolvedValue(null),
  isJsonObject: (value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value),
  isRecognizedPushEndpoint: (value: unknown) => typeof value === "string",
  isValidDeviceId: (value: unknown) => typeof value === "string",
  parsePushSubscription: () => ({
    endpoint: "https://web.push.apple.com/test-token",
    keys: { p256dh: "test-p256dh", auth: "test-auth" },
  }),
  pushJson: (body: unknown, init: ResponseInit = {}) => Response.json(body, init),
  readPushJson: async (request: Request) => ({ ok: true, value: await request.json() }),
}));

import { POST as savePreferences } from "./prefs/route";
import { POST as subscribe } from "./subscribe/route";

function request(path: string, body: Record<string, unknown>) {
  return new Request(`https://frederickradius.app${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("push home-town validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardPushMutation.mockResolvedValue(null);
    mocks.getDb.mockReturnValue(null);
  });

  it.each(["constructor", "__proto__", "toString"])(
    "rejects inherited key %s when subscribing",
    async (homeTown) => {
      const response = await subscribe(request("/api/push/subscribe", {
        subscription: {},
        topics: [],
        home_town: homeTown,
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid home town." });
      expect(mocks.getDb).not.toHaveBeenCalled();
    },
  );

  it.each(["constructor", "__proto__", "toString"])(
    "rejects inherited key %s when saving preferences",
    async (homeTown) => {
      const response = await savePreferences(request("/api/push/prefs", {
        endpoint: "https://web.push.apple.com/test-token",
        quiet_start: null,
        quiet_end: null,
        home_town: homeTown,
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid home town." });
      expect(mocks.getDb).not.toHaveBeenCalled();
    },
  );
});
