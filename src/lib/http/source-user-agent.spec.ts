import { describe, expect, it } from "vitest";
import {
  BROWSER_SOURCE_USER_AGENT,
  hostNeedsBrowserUserAgent,
  sourceFetchUserAgent,
} from "./source-user-agent";

describe("sourceFetchUserAgent", () => {
  it("uses a browser-shaped UA for Celebrate Frederick and Visit Frederick", () => {
    expect(
      sourceFetchUserAgent("https://www.celebratefrederick.com/events/?ical=1"),
    ).toBe(BROWSER_SOURCE_USER_AGENT);
    expect(
      sourceFetchUserAgent("https://celebratefrederick.com/calendar-of-events"),
    ).toBe(BROWSER_SOURCE_USER_AGENT);
    expect(
      sourceFetchUserAgent("https://www.visitfrederick.org/event/rss/"),
    ).toBe(BROWSER_SOURCE_USER_AGENT);
    expect(sourceFetchUserAgent("https://visitfrederick.org/event/rss/")).toBe(
      BROWSER_SOURCE_USER_AGENT,
    );
  });

  it("keeps the caller fallback for every other host", () => {
    const fallback = "FrederickRadius/1.0 (+https://frederickradius.app; event index)";
    expect(
      sourceFetchUserAgent("https://www.frederickcountymd.gov/RSSFeed.aspx", fallback),
    ).toBe(fallback);
    expect(
      sourceFetchUserAgent("https://downtownfrederick.org/wp-json/wp/v2/vibemap_event"),
    ).toBe("FrederickRadius/1.0 (+https://frederickradius.app)");
  });

  it("does not treat lookalike hosts as the blocked publishers", () => {
    expect(
      hostNeedsBrowserUserAgent("https://notvisitfrederick.org/event/rss/"),
    ).toBe(false);
    expect(
      hostNeedsBrowserUserAgent("https://celebratefrederick.com.evil.example/"),
    ).toBe(false);
    expect(hostNeedsBrowserUserAgent("not-a-url")).toBe(false);
  });
});
