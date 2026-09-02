import { describe, expect, it } from "vitest";

import { materializeFairGroundsMap } from "../scripts/materialize-fair-grounds-map";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="39.4100" lon="-77.3950" timestamp="2026-08-16T19:12:58Z">
    <tag k="name" v="Gate 1" />
  </node>
  <node id="2" lat="39.4110" lon="-77.3940" timestamp="2026-08-16T19:12:58Z">
    <tag k="amenity" v="toilets" />
  </node>
  <node id="3" lat="39.4120" lon="-77.3930" />
  <node id="4" lat="39.4121" lon="-77.3930" />
  <node id="5" lat="39.4121" lon="-77.3929" />
  <node id="6" lat="39.4120" lon="-77.3930" />
  <node id="7" lat="39.4150" lon="-77.3900">
    <tag k="name" v="Unrelated business" />
  </node>
  <way id="10" timestamp="2026-08-16T19:12:58Z">
    <nd ref="3" /><nd ref="4" /><nd ref="5" /><nd ref="6" />
    <tag k="name" v="4H Building" />
    <tag k="building" v="yes" />
  </way>
  <way id="11" timestamp="2026-08-16T19:12:58Z">
    <nd ref="3" /><nd ref="4" /><nd ref="5" /><nd ref="6" />
    <tag k="building" v="yes" />
    <tag k="shop" v="ticket" />
  </way>
</osm>`;

describe("Fair grounds map materializer", () => {
  it("keeps only reviewed Fair features and preserves source-level attribution", () => {
    const map = materializeFairGroundsMap(XML, "2026-09-02", {
      nodeIds: new Set(["1", "2"]),
      wayIds: new Set(["10", "11"]),
    });

    expect(map.features).toHaveLength(4);
    expect(map.features.map((feature) => feature.properties.name)).toEqual([
      "Gate 1",
      "Restroom",
      "4-H Building",
      "Ticket booth",
    ]);
    expect(map.features[2].properties.scheduleAliases).toEqual([]);
    expect(map.features[2].properties.sourceUrl).toBe(
      "https://www.openstreetmap.org/way/10",
    );
    expect(map.features[3].properties.kind).toBe("ticket");
    expect(map.source.publisher).toBe("OpenStreetMap contributors");
    expect(map.source.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses an artifact made only from unreviewed, off-ground, or incomplete geometry", () => {
    const unsafeXml = `<osm version="0.6">
      <node id="20" lat="39.5000" lon="-77.3950"><tag k="amenity" v="toilets" /></node>
      <node id="21" lat="39.4120" lon="-77.3930" />
      <node id="22" lat="39.4121" lon="-77.3930" />
      <way id="30"><nd ref="21" /><nd ref="22" /><nd ref="999" /><tag k="name" v="4H Building" /></way>
      <node id="9999" lat="39.4120" lon="-77.3930"><tag k="amenity" v="toilets" /></node>
    </osm>`;
    expect(() =>
      materializeFairGroundsMap(unsafeXml, "2026-09-02", {
        nodeIds: new Set(["20"]),
        wayIds: new Set(["30"]),
      }),
    ).toThrow("refusing to write an empty artifact");
    expect(() =>
      materializeFairGroundsMap(unsafeXml, "2026-02-30", {
        nodeIds: new Set(),
        wayIds: new Set(),
      }),
    ).toThrow("real YYYY-MM-DD date");
  });
});
