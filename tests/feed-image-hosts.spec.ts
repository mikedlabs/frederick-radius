import { describe, expect, it } from "vitest";
import config from "../next.config";
import { FEED_IMAGE_REMOTE_PATTERNS } from "@/lib/events/feed-image";

describe("feed image next/image allowlist", () => {
  it("lists every feed-image host in next.config remotePatterns", () => {
    const remote = config.images?.remotePatterns ?? [];
    for (const pattern of FEED_IMAGE_REMOTE_PATTERNS) {
      expect(
        remote,
        `${pattern.hostname}${pattern.pathname ?? ""} must be in next.config`,
      ).toContainEqual(
        expect.objectContaining({
          protocol: "https",
          hostname: pattern.hostname,
          ...(pattern.pathname ? { pathname: pattern.pathname } : {}),
        }),
      );
    }
  });
});
