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

// T5/T3c — named entities feeds emit beyond the basics, plus a residual
// guard so no raw `&word;` can ever reach body or metadata.
describe("cleanFeedText (named entities + residual guard)", () => {
  it("decodes the bullet entity (the audit's &bull;)", () => {
    expect(cleanFeedText("Doors 7 &bull; show 8")).toBe("Doors 7 • show 8");
  });

  it("decodes the curated named set (fractions, symbols, accents)", () => {
    expect(cleanFeedText("a&middot;b")).toBe("a·b");
    expect(cleanFeedText("90&deg;")).toBe("90°");
    expect(cleanFeedText("Acme&trade; &copy;2026 &reg;")).toBe("Acme™ ©2026 ®");
    expect(cleanFeedText("2&times;4 / 6&divide;2")).toBe("2×4 / 6÷2");
    expect(cleanFeedText("&frac12; off, &frac14; left, &frac34; full")).toBe(
      "½ off, ¼ left, ¾ full",
    );
    expect(cleanFeedText("Caf&eacute; Nola")).toBe("Café Nola");
  });

  it("residual guard: unknown named entities never leak raw (→ space)", () => {
    const out = cleanFeedText("foo &madeupentity; bar");
    expect(out).not.toContain("&madeupentity;");
    expect(out).not.toMatch(/&[a-z]+;/i);
    expect(out).toBe("foo bar");
  });

  it("decodes a double-encoded bullet (&amp;bull; → •)", () => {
    expect(cleanFeedText("x &amp;bull; y")).toBe("x • y");
  });

  it("leaves real ampersands in plain text alone (C&O, AT&T)", () => {
    expect(cleanFeedText("C&O Canal Towpath")).toBe("C&O Canal Towpath");
    expect(cleanFeedText("AT&T Store")).toBe("AT&T Store");
  });

  it("decodes &amp;-encoded ampersands correctly (C&amp;O → C&O)", () => {
    expect(cleanFeedText("C&amp;O Canal")).toBe("C&O Canal");
  });
});
