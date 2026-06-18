import { describe, it, expect } from "vitest";
import {
  cleanDescription,
  cleanVenueName,
  cleanTitle,
  dedupeSentences,
  clampDescription,
  isOfficialsRoster,
} from "./normalize";

describe("cleanTitle sponsor strip", () => {
  it("strips a 'sponsored by …' clause up to a pipe, keeping the double bill", () => {
    expect(
      cleanTitle(
        "Summerfest Family Theatre sponsored by Pediatric Dental Center of Frederick & Smile Frederick Orthodontics | Rainbow Rock Band",
      ),
    ).toBe("Summerfest Family Theatre | Rainbow Rock Band");
  });

  it("strips a trailing 'presented by …' clause", () => {
    expect(cleanTitle("Jazz on the Creek presented by Acme Bank")).toBe("Jazz on the Creek");
  });

  it("leaves an ordinary title untouched", () => {
    expect(cleanTitle("Alive @ Five at Carroll Creek")).toBe("Alive @ Five at Carroll Creek");
  });

  it("does not mistake prose 'by' for a sponsor clause", () => {
    expect(cleanTitle("Painting by Candlelight")).toBe("Painting by Candlelight");
  });
});

describe("dedupeSentences", () => {
  it("drops an exactly repeated paragraph (the techfrederick case)", () => {
    const para =
      "Join area leaders for a candid conversation about growing a tech business in Frederick.";
    expect(dedupeSentences(`${para} ${para} ${para}`)).toBe(para);
  });

  it("keeps distinct sentences in order", () => {
    const s = "First point here. Second point follows. Third closes it out.";
    expect(dedupeSentences(s)).toBe(s);
  });

  it("lets short interjections repeat", () => {
    const s = "Join us! Live music all night. Join us!";
    expect(dedupeSentences(s)).toBe(s);
  });
});

describe("clampDescription", () => {
  it("returns short text untouched", () => {
    expect(clampDescription("A night market on Carroll Creek.", 320)).toBe(
      "A night market on Carroll Creek.",
    );
  });

  it("cuts at a sentence boundary, never mid-clause", () => {
    const first = "Sentence one runs about here and ends cleanly.";
    const out = clampDescription(`${first} ${"x".repeat(400)}`, 320);
    expect(out).toBe(first);
  });

  it("falls back to a word-boundary cut + ellipsis when no sentence fits", () => {
    const out = clampDescription(`${"word ".repeat(100)}end`, 100);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
  });

  it("is idempotent", () => {
    const once = clampDescription("alpha beta. ".repeat(60), 300);
    expect(clampDescription(once, 300)).toBe(once);
  });
});

describe("cleanVenueName", () => {
  it("nulls a description/metadata dump leaked into the venue", () => {
    expect(
      cleanVenueName("Description: Did you know Frederick City & County are Bee Cities?"),
    ).toBeNull();
    expect(cleanVenueName("Event Time: 7 PM")).toBeNull();
  });

  it("keeps real venue names", () => {
    expect(cleanVenueName("Carroll Creek Amphitheater")).toBe("Carroll Creek Amphitheater");
    expect(cleanVenueName("Brewer's Alley")).toBe("Brewer's Alley");
  });

  it("nulls empty / missing", () => {
    expect(cleanVenueName("")).toBeNull();
    expect(cleanVenueName(null)).toBeNull();
    expect(cleanVenueName(undefined)).toBeNull();
  });
});

describe("cleanDescription", () => {
  it("strips a full metadata-dump block to empty", () => {
    expect(
      cleanDescription("Event date: June 9, 2026 Event Time: 6:00 PM Location: City Hall"),
    ).toBe("");
    expect(cleanDescription("Date: Jun 9 Time: 6 PM")).toBe("");
  });

  it("strips a leading metadata block but keeps the prose after it", () => {
    expect(
      cleanDescription(
        "Event date: June 9 Event Time: 6 PM Come enjoy live music at the park!",
      ),
      // The chain (date→time) is removed; the final "Event Time:" segment is
      // kept rather than risk eating the prose — prose is never lost.
    ).toBe("Event Time: 6 PM Come enjoy live music at the park!");
  });

  it("strips a 'Event Time: … Description: <prose>' dump to just the prose", () => {
    // The exact shape the live County feed leaked onto prod.
    expect(
      cleanDescription(
        "Event Time: 07:00 PM - 11:59 PM Description: The Agriculture Business Council was formed to invest in local farms.",
      ),
    ).toBe("The Agriculture Business Council was formed to invest in local farms.");
  });

  it("drops a bare 'Description:' prefix, keeping the prose", () => {
    expect(cleanDescription("Description: A night market on Carroll Creek.")).toBe(
      "A night market on Carroll Creek.",
    );
  });

  it("leaves ordinary prose untouched", () => {
    const prose = "Join us for a wine tasting at the vineyard with live jazz.";
    expect(cleanDescription(prose)).toBe(prose);
  });

  it("never eats a standalone one-line description that starts with a label word", () => {
    // No chain → the lone-label drop must NOT fire.
    expect(cleanDescription("Time: A Musical Journey Through the Decades")).toBe(
      "Time: A Musical Journey Through the Decades",
    );
  });

  it("preserves prose that merely contains a colon", () => {
    const s = "Our promise: a great night out for the whole family.";
    expect(cleanDescription(s)).toBe(s);
  });

  it("decodes entities and collapses whitespace (via cleanFeedText)", () => {
    expect(cleanDescription("Live   music &amp;  dancing")).toBe("Live music & dancing");
  });

  it("handles null/undefined/empty", () => {
    expect(cleanDescription(null)).toBe("");
    expect(cleanDescription(undefined)).toBe("");
    expect(cleanDescription("")).toBe("");
  });

  it("is idempotent", () => {
    const once = cleanDescription("Event date: Jun 9 Time: 6 PM Location: Carroll Creek");
    expect(cleanDescription(once)).toBe(once);
  });
});

describe("isOfficialsRoster + cleanDescription roster handling", () => {
  it("drops the county calendar officials roster (2026-06 audit, blocker 3)", () => {
    const roster =
      "Council Vice President Kavonte Duckett, Council Member Jerry Donald, Council Member Renee Knapp, Council Member M.C. Keegan-Ayer";
    expect(isOfficialsRoster(roster)).toBe(true);
    expect(cleanDescription(roster)).toBe("");
  });

  it("keeps real prose that mentions officials", () => {
    const prose =
      "Mayor O'Connor will speak at noon. The celebration includes live music, food vendors, and a kids zone.";
    expect(isOfficialsRoster(prose)).toBe(false);
    expect(cleanDescription(prose)).toContain("live music");
  });

  it("keeps short comma lists that are not rosters", () => {
    expect(isOfficialsRoster("Live music, food vendors, kids zone, face painting")).toBe(false);
  });

  it("keeps a two-name roster fragment (under the 3-segment floor)", () => {
    expect(isOfficialsRoster("Mayor Smith, Council Member Jones")).toBe(false);
  });
});
