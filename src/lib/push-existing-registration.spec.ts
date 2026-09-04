import { describe, expect, it } from "vitest";

import type { PushTopic } from "@/lib/push-topics";
import { reconcileExistingPushRegistration } from "./push-existing-registration";

const MANAGED_TOPICS: PushTopic[] = ["civic-alerts", "parking"];

describe("existing browser push registration reconciliation", () => {
  it("requires endpoint renewal when the authoritative server row is missing", async () => {
    const result = await reconcileExistingPushRegistration({
      topicsResponse: Response.json({ registered: false, topics: [] }),
      managedTopics: MANAGED_TOPICS,
    });

    expect(result).toEqual({ state: "missing", topics: [] });
  });

  it("does not overwrite preferences when server state cannot be verified", async () => {
    const result = await reconcileExistingPushRegistration({
      topicsResponse: Response.json({ topics: [] }),
      managedTopics: MANAGED_TOPICS,
    });

    expect(result).toEqual({ state: "unverified", topics: [] });
  });

  it("hydrates only topics owned by the settings UI for a healthy row", async () => {
    const result = await reconcileExistingPushRegistration({
      topicsResponse: Response.json({
        registered: true,
        topics: ["parking", "saved-events", "biz:coffee-shop", "unknown"],
      }),
      managedTopics: MANAGED_TOPICS,
    });

    expect(result).toEqual({ state: "connected", topics: ["parking"] });
  });
});
