import { describe, it, expect } from "vitest";
import { cleanFeedText } from "@/lib/integrations/ical-live";

/**
 * The Frederick County CivicEngage RSS feed entity-encodes its HTML
 * markup, so the description arrives as literal
 * `&lt;strong&gt;Event date:&lt;/strong&gt; … &lt;br&gt;` text. Before
 * the fix, the tag-strip ran before any entity decode and missed all of
 * it, so the explorer cards and the /events/live-… detail page rendered
 * the raw entities as prose. cleanFeedText must decode first, then strip.
 */
describe("cleanFeedText (County feed sanitization)", () => {
  const COUNTY_DESCRIPTION =
    "&lt;strong&gt;Event date:&lt;/strong&gt; May 17, 2026 &lt;br&gt;" +
    "&lt;strong&gt;Event time:&lt;/strong&gt; 10:30 AM - 2:00 PM&lt;br&gt;" +
    "Parks &amp; Rec hosts the Mayor&#39;s cleanup.&nbsp;All ages welcome.";

  it("leaves no angle brackets or entity-encoded markup behind", () => {
    const out = cleanFeedText(COUNTY_DESCRIPTION);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&lt;");
    expect(out).not.toContain("&gt;");
    expect(out).not.toContain("&amp;");
    expect(out).not.toContain("&#39;");
    expect(out).not.toContain("&nbsp;");
    expect(out).not.toMatch(/<\/?strong>|<br\s*\/?>/i);
  });

  it("produces readable prose with entities resolved and whitespace collapsed", () => {
    const out = cleanFeedText(COUNTY_DESCRIPTION);
    expect(out).toContain("Event date: May 17, 2026");
    expect(out).toContain("Event time: 10:30 AM - 2:00 PM");
    expect(out).toContain("Parks & Rec hosts the Mayor's cleanup.");
    expect(out).toContain("All ages welcome.");
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).toBe(out.trim());
  });

  it("collapses a doubly entity-encoded tag in a single pass (amp-before-lt)", () => {
    const out = cleanFeedText(
      "&amp;lt;strong&amp;gt;Heads up&amp;lt;/strong&amp;gt; rain or shine",
    );
    expect(out).toBe("Heads up rain or shine");
  });

  it("still strips already-decoded real tags, so iCal feeds are safe too", () => {
    expect(cleanFeedText("<p>Free <em>family</em> day</p>")).toBe("Free family day");
  });

  it("decodes numeric and hex entities", () => {
    expect(cleanFeedText("Caf&#233; opens at 9&#x20;AM")).toBe("Café opens at 9 AM");
  });

  it("stays clean under the 300-char storage cap", () => {
    const long = "&lt;p&gt;" + "word ".repeat(120) + "&lt;/p&gt;";
    const capped = cleanFeedText(long).slice(0, 300);
    expect(capped.length).toBeLessThanOrEqual(300);
    expect(capped).not.toContain("<");
    expect(capped).not.toContain("&lt;");
  });
});
