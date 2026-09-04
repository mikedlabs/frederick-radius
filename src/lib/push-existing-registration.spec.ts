import { describe, expect, it, vi } from "vitest";

import type { PushTopic } from "@/lib/push-topics";
import { reconcileExistingPushRegistration } from "./push-existing-registration";

const MANAGED_TOPICS: PushTopic[] = ["civic-alerts", "parking"];

function subscription() {
  return {
    endpoint: "https://web.push.apple.com/existing-device",
    toJSON: () => ({
      endpoint: "https://web.push.apple.com/existing-device",
      expirationTime: null,
      keys: { auth: "auth-key", p256dh: "public-key" },
    }),
  };
}

describe("existing browser push registration reconciliation", () => {
  it("recreates a missing server row before reporting the device connected", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));

    const result = await reconcileExistingPushRegistration({
      subscription: subscription(),
      topicsResponse: Response.json({ registered: false, topics: [] }),
      managedTopics: MANAGED_TOPICS,
      fetcher,
      deviceId: "device-123",
      homeTown: "frederick",
    });

    expect(result).toEqual({ connected: true, topics: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription().toJSON(),
        topics: [],
        device_id: "device-123",
        home_town: "frederick",
      }),
    });
  });

  it("does not claim connection when the missing-row repair fails", async () => {
    const result = await reconcileExistingPushRegistration({
      subscription: subscription(),
      topicsResponse: Response.json({ registered: false, topics: [] }),
      managedTopics: MANAGED_TOPICS,
      fetcher: vi.fn(async () => Response.json({}, { status: 503 })),
    });

    expect(result).toEqual({ connected: false, topics: [] });
  });

  it("does not overwrite preferences when server state cannot be verified", async () => {
    const fetcher = vi.fn();

    const result = await reconcileExistingPushRegistration({
      subscription: subscription(),
      topicsResponse: Response.json({ topics: [] }),
      managedTopics: MANAGED_TOPICS,
      fetcher,
    });

    expect(result).toEqual({ connected: false, topics: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("hydrates only topics owned by the settings UI for a healthy row", async () => {
    const fetcher = vi.fn();

    const result = await reconcileExistingPushRegistration({
      subscription: subscription(),
      topicsResponse: Response.json({
        registered: true,
        topics: ["parking", "saved-events", "biz:coffee-shop", "unknown"],
      }),
      managedTopics: MANAGED_TOPICS,
      fetcher,
    });

    expect(result).toEqual({ connected: true, topics: ["parking"] });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
