import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/steinhardt-squarespace.json" with { type: "json" };
import { approvedVenueFeedImage, squarespaceItemImage } from "./feed-image";

const collection = "https://www.steinhardtbrewing.com/live-music-events";
const slug = "steinhardt-brewing-company-frederick";
const image = fixture.upcoming[0].assetUrl;

describe("source-bound publisher artwork", () => {
  it("reuses all27 actual image fields while rejecting all6 HTML fields in the preserved33-row fixture", () => {
    const images = fixture.upcoming.map((item) => squarespaceItemImage(item, collection));
    expect(images.filter(Boolean)).toHaveLength(27);
    expect(images[0]).toBe(image);
    expect(squarespaceItemImage(fixture.upcoming.find((item) => item.title === "Mahjong")!, collection)).toBeUndefined();
    expect(fixture.upcoming).toHaveLength(33);
  });

  it.each([
    ["https://www.rockwellbrewery.com/events", slug],
    ["https://www.thebanyanmd.com/livemusic", slug],
    ["https://frederick.librarycalendar.com/events/feed/json", slug],
    [collection, "rockwell-brewery-frederick"],
    [collection, undefined],
    [`${collection}?format=json`, slug],
    ["https://www.steinhardtbrewing.com/live-music-events-unreviewed", slug],
  ])("rejects a publisher/venue mismatch or unreviewed collection %s %s", (source, venue) => {
    expect(approvedVenueFeedImage(image, source, venue)).toBeUndefined();
  });

  it.each([
    image.replace("5f9ef850cc5c2c1189e6fb4a", "583ddb1815d5dbc22734fd0e"),
    image.replace("https:", "http:"),
    image.replace("images.squarespace-cdn.com", "images.squarespace-cdn.com.example.test"),
    image.replace("images.squarespace-cdn.com", "images.squarespace-cdn.com:444"),
    image.replace("https://", "https://name:password@"),
    image.replace(/[^/]+$/, "placeholder.png"),
    image.replace(/[^/]+$/, "collection.html"),
    image.replace(/[^/]+$/, "%2e%2e%2fother.png"),
    `${image}#fragment`,
  ])("rejects wrong-account, non-image and ambiguous transport URLs: %s", (url) => {
    expect(approvedVenueFeedImage(url, collection, slug)).toBeUndefined();
  });

  it.each([
    { assetUrl: image, contentType: "text/html" },
    { assetUrl: image, originalSize: "1x1" },
    { assetUrl: image, originalSize: "unknown" },
    { assetUrl: image, systemDataSourceType: "HTML" },
  ])("rejects HTML, pixels and invalid published image dimensions", (item) => {
    expect(squarespaceItemImage(item, collection)).toBeUndefined();
  });
});
