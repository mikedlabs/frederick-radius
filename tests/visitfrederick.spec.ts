/**
 * normalizeVisitFrederickRss: the parse boundary for the Visit Frederick
 * (Simpleview) public events RSS feed. The feed gives calendar date RANGES,
 * not clock times, and a region tag instead of coordinates — so this asserts
 * the honest modelling choices: noon-Eastern start anchor, end-of-day Eastern
 * end, town-centroid placement (area geo, never a fake distance), and skipping
 * any item we can't anchor in time.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeVisitFrederickRss } from "@/lib/integrations/visitfrederick";
import { stampEventProvenance } from "@/lib/provenance";
import { easternParts } from "@/lib/tz";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

const NOW = new Date("2026-06-29T12:00:00Z");

/** Build one RSS <item> with the feed's real description scaffold: an image,
 *  the date range lines, a dash, then the blurb <p>. */
function item(opts: {
  title: string;
  id: number;
  cats: string[];
  start: string;
  end?: string;
  blurb?: string;
  image?: string;
}): string {
  const cats = opts.cats.map((c) => `<category><![CDATA[ ${c} ]]></category>`).join("\n");
  const range = opts.end ? `${opts.start} to\n${opts.end}` : `${opts.start} to\n${opts.start}`;
  return `
    <item>
      <title>${opts.title}</title>
      <link>https://www.visitfrederick.org/event/some-slug/${opts.id}/</link>
      ${cats}
      <guid ispermalink="false">https://www.visitfrederick.org/event/some-slug/${opts.id}/</guid>
      <pubDate>Mon, 29 Jun 2026 23:59:59 -0400</pubDate>
      <description><![CDATA[
        <img src='${opts.image ?? "https://assets.simpleviewinc.com/sv-frederick-county/image/fetch/c_fill,h_100,q_75,w_150/https://assets.simpleviewinc.com/simpleview/image/upload/crm/frederickcountymd/event.jpg"}'/>
        ${range}
        -
        <p>${opts.blurb ?? "A thing happening in town."}</p>
      ]]></description>
    </item>`;
}

const rss = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Events Calendar</title>${items}</channel></rss>`;

describe("normalizeVisitFrederickRss", () => {
  it("normalizes a well-formed multi-day listing", () => {
    const out = normalizeVisitFrederickRss(
      rss(item({ title: "Summer Exhibition", id: 25561, cats: ["Arts - Visual", "Downtown Frederick", "Free"], start: "07/01/2026", end: "07/31/2026" })),
      NOW,
    );
    expect(out).toHaveLength(1);
    const e = out[0];
    expect(e.id).toBe("vf-25561");
    expect(e.title).toBe("Summer Exhibition");
    expect(e.source).toBe("visit-frederick");
    expect(e.source_label).toBe("Visit Frederick");
    expect(e.url).toBe("https://www.visitfrederick.org/event/some-slug/25561/");
    expect(e.municipality).toBe("frederick");
    expect(e.category).toBe("arts");
    expect(e.is_free).toBe(true);
    expect(e.hero_image).toMatch(
      /^https:\/\/assets\.simpleviewinc\.com\//,
    );
    // Town centroid -> "area" geo confidence (lists, never claims a distance).
    expect(e.geom).toEqual(MUNICIPALITY_BY_SLUG.frederick!.centroid);
    expect(eventGeoConfidence({ geom: e.geom })).toBe("area");
  });

  it("anchors start to NOON Eastern and end to END-OF-DAY Eastern (DST-aware)", () => {
    const [e] = normalizeVisitFrederickRss(
      rss(item({ title: "Range", id: 1, cats: ["Downtown Frederick"], start: "07/01/2026", end: "07/31/2026" })),
      NOW,
    );
    const s = easternParts(new Date(e.starts_at));
    expect([s.month, s.day, s.hour]).toEqual([7, 1, 12]); // noon ET on the start day
    const en = easternParts(new Date(e.ends_at));
    expect([en.month, en.day, en.hour]).toEqual([7, 31, 23]); // last moment of the end day
    // ends_at after starts_at, so the pipeline keeps it as upcoming/ongoing.
    expect(Date.parse(e.ends_at)).toBeGreaterThan(Date.parse(e.starts_at));
  });

  it("treats a single-date listing as a one-day event", () => {
    const [e] = normalizeVisitFrederickRss(
      rss(item({ title: "One Day", id: 2, cats: ["Mount Airy"], start: "06/30/2026" })),
      NOW,
    );
    expect(easternParts(new Date(e.starts_at)).day).toBe(30);
    expect(easternParts(new Date(e.ends_at)).day).toBe(30);
    expect(e.municipality).toBe("mount-airy");
  });

  it("maps region tags to our municipality slugs, defaulting to the county seat", () => {
    const [b] = normalizeVisitFrederickRss(rss(item({ title: "B", id: 3, cats: ["Brunswick"], start: "07/01/2026" })), NOW);
    expect(b.municipality).toBe("brunswick");
    const [d] = normalizeVisitFrederickRss(rss(item({ title: "D", id: 4, cats: ["Some Unmapped Region"], start: "07/01/2026" })), NOW);
    expect(d.municipality).toBe("frederick");
  });

  it("decodes title/blurb entities", () => {
    const [e] = normalizeVisitFrederickRss(
      rss(item({ title: "Frederick&apos;s Art &amp; Soul &#x2014; Year 3", id: 5, cats: ["Free"], start: "07/01/2026", blurb: "Tom &amp; Jerry&apos;s show" })),
      NOW,
    );
    expect(e.title).toBe("Frederick's Art & Soul — Year 3");
    expect(e.description).toBe("Tom & Jerry's show");
  });

  it("rejects an image that is not on Visit Frederick's Simpleview host", () => {
    const [e] = normalizeVisitFrederickRss(
      rss(item({
        title: "Wrong image host",
        id: 8,
        cats: ["Downtown Frederick"],
        start: "07/01/2026",
        image: "https://images.example.com/untrusted.jpg",
      })),
      NOW,
    );
    expect(e.hero_image).toBeUndefined();
  });

  it("skips an item with no parseable date (no honest time anchor)", () => {
    const noDate = `<item><title>Mystery</title><link>https://www.visitfrederick.org/event/x/9/</link><description><![CDATA[<p>No dates here</p>]]></description></item>`;
    expect(normalizeVisitFrederickRss(rss(noDate), NOW)).toHaveLength(0);
  });

  it("returns [] for empty or non-RSS input, never throws", () => {
    expect(normalizeVisitFrederickRss("", NOW)).toEqual([]);
    expect(normalizeVisitFrederickRss("<html>not rss</html>", NOW)).toEqual([]);
  });

  it("stamps the publisher's public RSS as verified without implying a partnership", () => {
    const provenance = stampEventProvenance({
      slug: "x",
      source: "visit-frederick",
    });
    expect(provenance.confidence).toBe("verified");
    expect(provenance.license).toBe(
      "Publisher event RSS; factual fields only; publisher terms apply",
    );
  });

  it("parses the captured live feed fixture into valid, area-placed rows", () => {
    const xml = readFileSync(
      fileURLToPath(new URL("./fixtures/visitfrederick-rss.xml", import.meta.url)),
      "utf8",
    );
    const out = normalizeVisitFrederickRss(xml, NOW);
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) {
      expect(e.id.startsWith("vf-")).toBe(true);
      expect(e.title.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(e.starts_at))).toBe(true);
      expect(Number.isFinite(Date.parse(e.ends_at))).toBe(true);
      expect(Date.parse(e.ends_at)).toBeGreaterThanOrEqual(Date.parse(e.starts_at));
      expect(e.hero_image).toMatch(
        /^https:\/\/assets\.simpleviewinc\.com\//,
      );
      // Every row sits on a known town centroid -> never claims a precise distance.
      expect(eventGeoConfidence({ geom: e.geom })).toBe("area");
    }
  });
});
