import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/steinhardt-squarespace.json" with { type: "json" };
import {
  approvedFeedImageUrl,
  icalAttachImage,
  rssItemImage,
  squarespaceItemImage,
  tribeEventImage,
} from "./feed-image";

describe("approvedFeedImageUrl", () => {
  it("keeps an allowlisted Squarespace CDN photograph", () => {
    expect(
      approvedFeedImageUrl(
        "https://images.squarespace-cdn.com/content/v1/site/img/haunted+steinhardt+LS.png",
      ),
    ).toBe(
      "https://images.squarespace-cdn.com/content/v1/site/img/haunted+steinhardt+LS.png",
    );
  });

  it("drops tracking pixels, named placeholders, and off-list hosts", () => {
    expect(
      approvedFeedImageUrl("https://images.squarespace-cdn.com/content/pixel.gif"),
    ).toBeUndefined();
    expect(
      approvedFeedImageUrl(
        "https://marylandensemble.org/wp-content/uploads/2026/01/met-default.png",
      ),
    ).toBeUndefined();
    expect(
      approvedFeedImageUrl("https://example.com/wp-content/uploads/event.jpg"),
    ).toBeUndefined();
    expect(
      approvedFeedImageUrl("http://images.squarespace-cdn.com/content/v1/a.jpg"),
    ).toBeUndefined();
  });

  it("drops a published 1x1 originalSize even on an allowlisted host", () => {
    expect(
      approvedFeedImageUrl(
        "https://images.squarespace-cdn.com/content/v1/site/img/tiny.png",
        { originalSize: "1x1" },
      ),
    ).toBeUndefined();
  });
});

describe("squarespaceItemImage", () => {
  it("captures Steinhardt event art and ignores HTML collection URLs", () => {
    const items = fixture.upcoming;
    const images = items.map((item) => squarespaceItemImage(item));
    const kept = images.filter((url): url is string => Boolean(url));
    expect(items).toHaveLength(33);
    expect(kept).toHaveLength(27);
    expect(kept.every((url) => url.startsWith("https://"))).toBe(true);
    expect(
      squarespaceItemImage(
        items.find((item) => item.title === "Haunted Haloween Terrarium Workshop")!,
      ),
    ).toMatch(/haunted\+steinhardt\+LS\.png$/);
    expect(
      squarespaceItemImage(items.find((item) => item.title === "Mahjong")!),
    ).toBeUndefined();
  });

  it("rejects a text/html assetUrl even when the host is Squarespace", () => {
    expect(
      squarespaceItemImage({
        assetUrl:
          "https://static1.squarespace.com/static/5f9ef850cc5c2c1189e6fb4a/63fbd6a3e552a97c025d010b/6aaf47a88598bb5c9cec89a2/1789872062045/",
        contentType: "text/html",
      }),
    ).toBeUndefined();
  });
});

describe("icalAttachImage", () => {
  it("keeps an image ATTACH from a WordPress calendar", () => {
    expect(
      icalAttachImage(
        "image/jpeg",
        "https://delaplaine.org/wp-content/uploads/2025/10/show.jpg",
      ),
    ).toBe("https://delaplaine.org/wp-content/uploads/2025/10/show.jpg");
  });

  it("drops a non-image attachment and a cid payload", () => {
    expect(
      icalAttachImage(
        "application/pdf",
        "https://delaplaine.org/wp-content/uploads/2025/10/poster.pdf",
      ),
    ).toBeUndefined();
    expect(icalAttachImage("image/jpeg", "cid:logo@example.com")).toBeUndefined();
  });
});

describe("rssItemImage", () => {
  it("reads an image enclosure with a real calendar filename", () => {
    expect(
      rssItemImage(
        `<title>Blessing</title><enclosure url="https://www.mountairymd.gov/calendar/pass.jpeg" type="image/jpeg" length="178663" />`,
      ),
    ).toBe("https://www.mountairymd.gov/calendar/pass.jpeg");
  });

  it("ignores a CivicPlus DocumentCenter viewer and a non-image enclosure", () => {
    expect(
      rssItemImage(
        `<enclosure url="https://www.mountairymd.gov/DocumentCenter/View/6135" type="image/png" length="0" />`,
      ),
    ).toBeUndefined();
    expect(
      rssItemImage(
        `<enclosure url="https://www.mountairymd.gov/calendar/event.ics" type="text/calendar" />`,
      ),
    ).toBeUndefined();
  });
});

describe("tribeEventImage", () => {
  it("resolves a relative WordPress upload against the feed origin", () => {
    expect(
      tribeEventImage(
        {
          url: "/wp-content/uploads/2016/08/carty.jpg",
          width: 3143,
          height: 2286,
        },
        "https://www.civilwarmed.org/wp-json/tribe/events/v1/events",
      ),
    ).toBe("https://www.civilwarmed.org/wp-content/uploads/2016/08/carty.jpg");
  });

  it("drops MET's site-wide default art", () => {
    expect(
      tribeEventImage(
        {
          url: "https://marylandensemble.org/wp-content/uploads/2026/01/met-default.png",
          width: 1440,
          height: 900,
        },
        "https://marylandensemble.org/wp-json/tribe/events/v1/events",
      ),
    ).toBeUndefined();
  });
});
