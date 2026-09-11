import { describe, it, expect } from "vitest";
import {
  catalogMentions,
  fairFrictionTopics,
  parseRadarEntries,
} from "./redditRadar";

const NOW = Date.parse("2026-07-21T16:00:00Z");

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?><feed>
<entry><title>Looks like the new Sardis is open.</title>
<link href="https://www.reddit.com/r/frederickmd/comments/aaa/new_sardis/"/>
<updated>2026-07-21T02:07:00+00:00</updated></entry>
<entry><title>Any good sushi recommendations downtown?</title>
<link href="https://www.reddit.com/r/frederickmd/comments/bbb/sushi/"/>
<updated>2026-07-21T15:00:00+00:00</updated></entry>
<entry><title>Weekly thread</title>
<link href="https://www.reddit.com/r/frederickmd/wiki/rules"/>
<updated>2026-07-21T15:30:00+00:00</updated></entry>
</feed>`;

describe("parseRadarEntries", () => {
  it("parses titles + permalinks, newest first, and drops non-post links", () => {
    const posts = parseRadarEntries(FIXTURE, NOW);
    expect(posts).toHaveLength(2); // wiki link dropped
    expect(posts[0].title).toMatch(/sushi/i); // newest first
    expect(posts[1].url).toContain("/comments/aaa/");
    expect(posts[0].agoLabel).toBe("1h ago");
  });

  it("flags leads and asks separately", () => {
    const posts = parseRadarEntries(FIXTURE, NOW);
    const sardis = posts.find((p) => /sardis/i.test(p.title))!;
    const sushi = posts.find((p) => /sushi/i.test(p.title))!;
    expect(sardis.lead).toBe(true);
    expect(sardis.ask).toBe(false);
    expect(sushi.ask).toBe(true);
    expect(sushi.lead).toBe(false);
  });
});

describe("catalogMentions", () => {
  it("matches a real catalog place name in a title", () => {
    expect(catalogMentions("Dinner at Cugino Forno was great tonight")).toContain("Cugino Forno");
  });
  it("does not fire on generic words or empty titles", () => {
    expect(catalogMentions("Frederick traffic is wild on Market Street")).toEqual([]);
    expect(catalogMentions("")).toEqual([]);
  });
});

describe("fairFrictionTopics", () => {
  it("turns Fair questions into private review labels without treating them as facts", () => {
    expect(
      fairFrictionTopics("Great Frederick Fair parking and re-entry question"),
    ).toEqual(["arrival", "policy"]);
    expect(
      fairFrictionTopics("The Grandstand at the Great Frederick Fair"),
    ).toEqual(["tickets"]);
    expect(fairFrictionTopics("Great Frederick Fair 2025 photos")).toEqual([
      "other",
    ]);
  });
});
