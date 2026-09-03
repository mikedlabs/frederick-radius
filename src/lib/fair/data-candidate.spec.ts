import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertOfficialVendorPageReferencesShow,
  buildEventHubExhibitorMapIndex,
  diffFairScheduleCandidates,
  parseEventHubExhibitors,
  parseEventHubFloorplans,
  parseEventHubMap,
  parseOfficialFairPages,
} from "./data-candidate";
import { parseGreatFrederickFair2026Schedule } from "./schedule";

const OFFICIAL_2026_FIXTURE = readFileSync(
  new URL("./__fixtures__/great-frederick-fair-2026.ics", import.meta.url),
  "utf8",
);

describe("Fair official-data candidates", () => {
  it("distinguishes an identical live schedule from a visitor-visible change", () => {
    const reviewed = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const same = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const changed = parseGreatFrederickFair2026Schedule(
      OFFICIAL_2026_FIXTURE.replace(
        "Daughtry - Presented by Team Reeder",
        "Daughtry with a newly published guest - Presented by Team Reeder",
      ),
    );

    expect(diffFairScheduleCandidates(reviewed, same)).toMatchObject({
      status: "same",
      reviewedDayCount: 9,
      candidateDayCount: 9,
      reviewedItemCount: 190,
      candidateItemCount: 190,
      added: [],
      removed: [],
      changedDayCounts: [],
    });

    const diff = diffFairScheduleCandidates(reviewed, changed);
    expect(diff.status).toBe("content-changed");
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.changedDayCounts).toEqual([]);
    expect(diff.added[0].text).toContain("newly published guest");
  });

  it("reports selected-source timestamp churn separately from schedule content", () => {
    const reviewed = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const timestampOnly = parseGreatFrederickFair2026Schedule(
      OFFICIAL_2026_FIXTURE.replaceAll(
        "LAST-MODIFIED:20260829T125236Z",
        "LAST-MODIFIED:20260830T125236Z",
      ),
    );

    expect(timestampOnly.sourceRevision).not.toBe(reviewed.sourceRevision);
    expect(diffFairScheduleCandidates(reviewed, timestampOnly)).toMatchObject({
      status: "source-revision-only",
      added: [],
      removed: [],
      changedDayCounts: [],
    });
  });

  it("requires the official Fair page to bind the configured EventHub show", () => {
    expect(() =>
      assertOfficialVendorPageReferencesShow(
        '<a href="https://mobile.eventhub-floorplan.net/?Show_ID=18209">Map</a>',
        "18209",
      ),
    ).not.toThrow();
    expect(() =>
      assertOfficialVendorPageReferencesShow(
        '<a href="https://mobile.eventhub-floorplan.net/?Show_ID=99999">Map</a>',
        "18209",
      ),
    ).toThrow("does not reference");
  });

  it("normalizes an exact set of official WordPress pages and their outbound links", () => {
    const pages = parseOfficialFairPages(
      JSON.stringify([
        {
          id: 1722,
          slug: "vendors",
          modified_gmt: "2026-08-28T20:15:00",
          link: "https://thegreatfrederickfair.com/vendors/",
          title: { rendered: "Vendors &amp; food" },
          content: {
            rendered:
              '<p>Find current exhibitors.</p><a href="https://mobile.eventhub-floorplan.net/?Show_ID=18209&amp;view=map">Open map</a>',
          },
        },
        {
          id: 3224,
          slug: "schedule",
          modified_gmt: "2026-08-28T21:00:33",
          link: "https://thegreatfrederickfair.com/schedule/",
          title: { rendered: "Schedule" },
          content: { rendered: "<p>Friday through Saturday.</p>" },
        },
      ]),
      [1722, 3224],
    );

    expect(pages).toEqual([
      expect.objectContaining({
        id: 1722,
        title: "Vendors & food",
        visibleText: "Find current exhibitors. Open map",
        modifiedAt: "2026-08-28T20:15:00Z",
        outboundUrls: [
          "https://mobile.eventhub-floorplan.net/?Show_ID=18209&view=map",
        ],
      }),
      expect.objectContaining({
        id: 3224,
        visibleText: "Friday through Saturday.",
      }),
    ]);
    expect(() => parseOfficialFairPages("[]", [1722])).toThrow(
      "omitted expected pages",
    );
  });

  it("extracts and deduplicates public exhibitor tiles without retaining markup", () => {
    const tile = (id: string, name: string, booths: string) => `
      <div class='nu catch' onClick="loadLink('https://mobile.map-dynamics.com/exhibitor-profile-g2app.php?ID=${id}');" style='cursor:pointer;'>
        <div class='exhib-tile-image placeholder' style="background-image: url('/css/iconsg2/icon_home_explore.png');"></div>
        <div class='exhib-title'>${name}</div>
        <span class='exhib-value'>Booths: ${booths}</span>
      </div>`;
    const html = `${tile("1638033", "Altmeyers &amp; Western Wear / 2A1A41", "409, 410, 410")}${tile("1638033", "Altmeyers &amp; Western Wear / 2A1A41", "409, 410, 410")}${tile("1854416", "Amazing Grace Missions / DF4326", "308")}`;

    expect(parseEventHubExhibitors(html)).toEqual([
      {
        profileId: "1638033",
        name: "Altmeyers & Western Wear",
        booths: ["409", "410"],
        duplicateBoothReferences: ["410"],
        media: { state: "placeholder", sourceUrl: null },
      },
      {
        profileId: "1854416",
        name: "Amazing Grace Missions",
        booths: ["308"],
        duplicateBoothReferences: [],
        media: { state: "placeholder", sourceUrl: null },
      },
    ]);
  });

  it("extracts only floorplans belonging to the configured Fair show", () => {
    const html = `
      <a href='https://mobile.map-dynamics.com/floorplan-g2app.php?Show_ID=18209&Map_ID=9566'>Machinery Row &amp; West End</a>
      <a href='https://mobile.map-dynamics.com/floorplan-g2app.php?Show_ID=99999&Map_ID=1000'>Wrong show</a>
      <a href='https://mobile.map-dynamics.com/floorplan-g2app.php?Show_ID=18209&amp;Map_ID=9564'>Under Grandstand</a>`;

    expect(parseEventHubFloorplans(html, "18209")).toEqual([
      {
        mapId: "9564",
        name: "Under Grandstand",
        sourceUrl:
          "https://mobile.map-dynamics.com/floorplan-g2app.php?Show_ID=18209&Map_ID=9564",
      },
      {
        mapId: "9566",
        name: "Machinery Row & West End",
        sourceUrl:
          "https://mobile.map-dynamics.com/floorplan-g2app.php?Show_ID=18209&Map_ID=9566",
      },
    ]);
  });

  it("normalizes booth geometry while preserving only explicit source state", () => {
    const html = `
      <style>#mapBox {height:1000px;width:2000px;background:url('https://mapd-client-images.s3.us-east-2.amazonaws.com/uploads/map.png');background-size: 100%;}</style>
      <a href="javascript:showModal('41', 'element-41', '9564');" ID='element-41' class='element rotated open type88031 booth3353095 ' style='background:#fff;top:250px;left:500px;width:100px;height:50px;'>Booth 41</a>`;

    expect(parseEventHubMap(html, "9564")).toEqual({
      mapId: "9564",
      width: 2000,
      height: 1000,
      backgroundImageUrl:
        "https://mapd-client-images.s3.us-east-2.amazonaws.com/uploads/map.png",
      booths: [
        {
          mapId: "9564",
          boothId: "3353095",
          elementId: "element-41",
          label: "41",
          sourceTypeId: "88031",
          sourceState: "open",
          bounds: { x: 500, y: 250, width: 100, height: 50 },
          normalizedBounds: { x: 0.25, y: 0.25, width: 0.05, height: 0.05 },
        },
      ],
      sourceWarnings: [],
    });
  });

  it("joins exhibitors to booth geometry without inventing an ambiguous map", () => {
    const booth = (mapId: string, boothId: string, label: string) => ({
      mapId,
      boothId,
      elementId: `element-${boothId}`,
      label,
      sourceTypeId: null,
      sourceState: "unspecified" as const,
      bounds: { x: 10, y: 20, width: 30, height: 40 },
      normalizedBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    const index = buildEventHubExhibitorMapIndex(
      [
        {
          profileId: "1",
          name: "Fair food",
          booths: ["12", "99", "404"],
          duplicateBoothReferences: [],
          media: { state: "placeholder", sourceUrl: null },
        },
      ],
      [
        {
          mapId: "a",
          width: 100,
          height: 100,
          backgroundImageUrl:
            "https://mapd-client-images.s3.us-east-2.amazonaws.com/a.png",
          booths: [booth("a", "101", "12"), booth("a", "102", "99")],
          sourceWarnings: [],
        },
        {
          mapId: "b",
          width: 100,
          height: 100,
          backgroundImageUrl:
            "https://mapd-client-images.s3.us-east-2.amazonaws.com/b.png",
          booths: [booth("b", "201", "99")],
          sourceWarnings: [],
        },
      ],
    );

    expect(index[0].locations.map((location) => location.resolution)).toEqual([
      "matched",
      "ambiguous",
      "unmatched",
    ]);
    expect(index[0].locations[0].matches[0]).toMatchObject({
      mapId: "a",
      boothId: "101",
    });
  });

  it("rejects unrecognized or out-of-bounds EventHub map data", () => {
    expect(() => parseEventHubExhibitors("<html></html>")).toThrow(
      "no recognizable exhibitor",
    );
    expect(() => parseEventHubFloorplans("<html></html>", "18209")).toThrow(
      "no floorplans",
    );
    expect(() =>
      parseEventHubMap(
        `<style>#mapBox {height:100px;width:100px;background:url('https://mapd-client-images.s3.us-east-2.amazonaws.com/map.png');}</style>
         <a href="javascript:showModal('1', 'element', '9564');" ID='element' class='element booth1' style='top:90px;left:90px;width:20px;height:20px;'>1</a>`,
        "9564",
      ),
    ).toThrow("invalid map bounds");
  });
});
