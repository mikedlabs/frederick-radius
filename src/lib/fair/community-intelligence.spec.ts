import { describe, expect, it } from "vitest";

import {
  fairFrictionTopics,
  parseFairCommunityFeed,
} from "./community-intelligence";

const FEED = `<?xml version="1.0"?><feed>
  <entry>
    <author><name>/u/not-retained</name></author>
    <content type="html">A body Radius must not retain.</content>
    <id>t3_fair123</id>
    <link href="https://www.reddit.com/r/frederickmd/comments/fair123/fair_parking/" />
    <published>2026-09-01T15:00:00+00:00</published>
    <title>Fair parking &amp; re-entry question</title>
  </entry>
  <entry>
    <id>t3_wrong</id>
    <link href="https://example.com/not-reddit" />
    <published>2026-09-01T16:00:00Z</published>
    <title>Wrong host</title>
  </entry>
</feed>`;

describe("Fair community intelligence", () => {
  it("keeps only titles, post links, dates, and triage topics", () => {
    expect(parseFairCommunityFeed(FEED)).toEqual([
      {
        id: "t3_fair123",
        title: "Fair parking & re-entry question",
        url: "https://www.reddit.com/r/frederickmd/comments/fair123/fair_parking/",
        publishedAt: "2026-09-01T15:00:00.000Z",
        topics: ["arrival", "policy"],
      },
    ]);
  });

  it("uses other when a title does not reveal visitor friction", () => {
    expect(fairFrictionTopics("Great Frederick Fair 2025 photos")).toEqual([
      "other",
    ]);
  });
});
