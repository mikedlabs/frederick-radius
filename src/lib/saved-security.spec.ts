import { describe, expect, it } from "vitest";
import { parseSavedRegistryInput } from "./saved-security";

describe("parseSavedRegistryInput", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/an-opaque-provider-token";

  it("accepts a provider-issued endpoint and event slug", () => {
    expect(parseSavedRegistryInput({ slug: "alive-at-five", endpoint })).toEqual({
      slug: "alive-at-five",
      endpoint,
    });
  });

  it("rejects arbitrary outbound URLs and malformed shapes", () => {
    expect(parseSavedRegistryInput({ slug: "alive-at-five", endpoint: "https://example.com/hook" })).toBeNull();
    expect(parseSavedRegistryInput({ slug: "../admin", endpoint })).toBeNull();
    expect(parseSavedRegistryInput({ slug: "alive-at-five", endpoint, extra: true })).toBeNull();
  });
});
