import { describe, expect, it } from "vitest";

import { buildPublicFairLayout, fairLayoutArtworkSource, parseFairLayoutAnnotations, parseFairLayoutBoothRotations } from "../scripts/lib/fair-layout-import";

const mapIds = ["9564", "9565", "9566"];
const imageUrl = "https://mapd-client-images.s3.us-east-2.amazonaws.com/uploads/source.png";
function boothMarkup(mapId = "9564", style = "") {
  return `<a href="javascript:showModal('1', 'a1', '${mapId}');" ID='a1' class='element rotated closed type1 booth101 ' style='top:10px;left:20px;width:30px;height:40px;${style}'>1</a>`;
}
function fixture() {
  const candidate = {
    checkedAt: "2026-09-21T13:37:38.606Z",
    eventHub: {
      showId: "18209",
      maps: mapIds.map((mapId, index) => ({
        mapId, name: `Section ${index + 1}`, width: 100, height: 100, backgroundImageUrl: imageUrl,
        booths: [{ boothId: "101", label: String(index + 1), bounds: { x: 20, y: 10, width: 30, height: 40 } }],
      })),
      exhibitors: [{ profileId: "123", name: "Example Exhibitor", booths: ["1", "2", "3"], contactEmail: "never-publish@example.test" }],
    },
  };
  const html = Object.fromEntries(mapIds.map((id, index) => [id, `<style>#mapBox {height:100px;width:100px;background:url('${imageUrl}');}</style>${boothMarkup(id).replace("showModal('1'", `showModal('${index + 1}'`)}`]));
  const images = Object.fromEntries(mapIds.map((id) => [id, { width: 200, height: 199 }]));
  return { candidate, html, images };
}
const date = "2026-09-21T14:00:00.000Z";

describe("manual Fair layout importer", () => {
  it("publishes only public fields and deduplicates repeated booth references", () => {
    const { candidate, html, images } = fixture();
    candidate.eventHub.exhibitors[0].booths.push("1");
    const result = buildPublicFairLayout(candidate, html, images, date);
    expect(result.vendors[0].boothIds).toEqual(["9564:101", "9565:101", "9566:101"]);
    expect(result.maps[0].booths[0].vendorIds).toEqual(["eventhub-123"]);
    expect(JSON.stringify(result)).not.toContain("contactEmail");
    expect(JSON.stringify(result)).not.toContain("never-publish");
  });

  it("fails closed when a vendor assignment cannot be resolved or input identities repeat", () => {
    const { candidate, html, images } = fixture();
    candidate.eventHub.exhibitors[0].booths.push("unknown");
    expect(() => buildPublicFairLayout(candidate, html, images, date)).toThrow("Unresolved or ambiguous");
    candidate.eventHub.exhibitors[0].booths.pop();
    candidate.eventHub.exhibitors.push(candidate.eventHub.exhibitors[0]);
    expect(() => buildPublicFairLayout(candidate, html, images, date)).toThrow("Duplicate exhibitor");
  });

  it("requires the exact reviewed section set and unchanged source geometry", () => {
    const { candidate, html, images } = fixture();
    expect(() => buildPublicFairLayout(candidate, { ...html, "9564": html["9564"].replace("width:30px", "width:31px") }, images, date)).toThrow("changed after");
    candidate.eventHub.maps[0].mapId = "9999";
    expect(() => buildPublicFairLayout(candidate, html, images, date)).toThrow("floorplan set changed");
  });

  it("preserves top-left rotations and rejects non-rotational or conflicting transforms", () => {
    expect(parseFairLayoutBoothRotations(boothMarkup("9564", "-ms-transform: rotate(341deg);transform: rotate(341deg);"))).toEqual(new Map([["101", 341]]));
    expect(parseFairLayoutBoothRotations(boothMarkup())).toEqual(new Map([["101", 0]]));
    for (const style of ["transform: scale(2);", "transform:rotate(2deg);-ms-transform:rotate(4deg);", "transform-origin:center center;"]) {
      expect(() => parseFairLayoutBoothRotations(boothMarkup("9564", style))).toThrow();
    }
  });

  it("keeps intrinsic image dimensions and source annotations without exposing editor residue", () => {
    const { candidate, html, images } = fixture();
    const result = buildPublicFairLayout(candidate, html, images, date);
    expect(result.maps[0]).toMatchObject({ width: 100, height: 100, imageWidth: 200, imageHeight: 199 });
    const label = (text: string, size = 28) => `<div data-type='text' style='transform: rotate(0deg);font-size: ${size}px;padding: 16px 24px;top:10px;left:20px'>${text}</div>`;
    expect(parseFairLayoutAnnotations(label("Building 7") + label("Click to edit") + label("Hidden source label", 0))).toEqual([
      { text: "Building 7", x: 44, y: 26, rotationDeg: 0, fontSize: 28 },
      { text: "Hidden source label", x: 44, y: 26, rotationDeg: 0, fontSize: 0 },
    ]);
  });

  it("accepts only the documented source artwork host and a numeric cache-busting query", () => {
    expect(fairLayoutArtworkSource(`${imageUrl}?timestamp=123`)).toBe(imageUrl);
    for (const url of ["http://mapd-client-images.s3.us-east-2.amazonaws.com/uploads/source.png", "https://evil.example/source.png", `${imageUrl}?redirect=https://evil.example`, imageUrl.replace("https://", "https://user:password@")]) {
      expect(() => fairLayoutArtworkSource(url)).toThrow();
    }
  });
});
