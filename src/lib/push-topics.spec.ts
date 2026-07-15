import { describe, expect, it } from "vitest";
import {
  OWNER_ALERTS_TOPIC,
  applyPublicTopicChanges,
  isPublicPushTopic,
  parsePublicTopicChanges,
  publicPushTopics,
} from "./push-topics";

describe("public push topics", () => {
  it("allows fixed event preferences and well-formed business topics", () => {
    expect(isPublicPushTopic("saved-events")).toBe(true);
    expect(isPublicPushTopic("civic-alerts")).toBe(true);
    expect(isPublicPushTopic("biz:brewers-alley")).toBe(true);
    expect(isPublicPushTopic("biz:holistic-family-medicine_dolma-johanison-lac")).toBe(true);
  });

  it("rejects owner alerts and unknown or malformed topics", () => {
    expect(isPublicPushTopic(OWNER_ALERTS_TOPIC)).toBe(false);
    expect(isPublicPushTopic("internal:signups")).toBe(false);
    expect(isPublicPushTopic("biz:")).toBe(false);
    expect(isPublicPushTopic("biz:bad/slug")).toBe(false);
  });

  it("rejects the entire change when owner alerts is added or removed", () => {
    expect(parsePublicTopicChanges(["saved-events", OWNER_ALERTS_TOPIC], [])).toBeNull();
    expect(parsePublicTopicChanges([], [OWNER_ALERTS_TOPIC])).toBeNull();
  });

  it("applies valid changes while preserving and hiding an existing owner topic", () => {
    const changes = parsePublicTopicChanges(
      ["saved-events", "biz:brewers-alley"],
      ["civic-alerts", "biz:old-place"],
    );
    expect(changes).not.toBeNull();
    if (!changes) throw new Error("expected valid public topic changes");

    const storedTopics = applyPublicTopicChanges(
      [OWNER_ALERTS_TOPIC, "civic-alerts", "biz:old-place"],
      changes,
    );

    expect(storedTopics).toEqual([
      OWNER_ALERTS_TOPIC,
      "saved-events",
      "biz:brewers-alley",
    ]);
    expect(publicPushTopics(storedTopics)).toEqual([
      "saved-events",
      "biz:brewers-alley",
    ]);
  });
});
