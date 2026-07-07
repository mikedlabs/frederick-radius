import { describe, it, expect } from "vitest";
import { normalizeEvFeature, evDetailLine } from "./evCharging";

// A downtown Frederick point (inside the county ring).
const FRED = { lng: -77.4105, lat: 39.4143 };
// Taneytown (Carroll County) — inside the loose bbox, outside the ring.
const TANEYTOWN = { lng: -77.173, lat: 39.655 };

function attrs(over: Record<string, unknown> = {}) {
  return {
    ID: 1234,
    Station_Name: "Building F",
    Street_Address: "118 N Market St",
    City: "Frederick",
    ZIP: "21701",
    Status_Code: "E",
    EV_Level2_EVSE_Num: 2,
    EV_DC_Fast_Count: 4,
    EV_Connector_Types: "J1772 J1772COMBO CHADEMO",
    EV_Network: "ChargePoint Network",
    EV_Network_Web: "https://chargepoint.com",
    Access_Days_Time: "24 hours daily",
    Longitude: FRED.lng,
    Latitude: FRED.lat,
    ...over,
  };
}

describe("normalizeEvFeature", () => {
  it("maps a live Frederick station", () => {
    const s = normalizeEvFeature(attrs())!;
    expect(s.name).toBe("Building F");
    expect(s.network).toBe("ChargePoint Network");
    expect(s.level2).toBe(2);
    expect(s.dcFast).toBe(4);
    expect(s.connectors).toBe("J1772, CCS, CHAdeMO");
    expect(s.address).toBe("118 N Market St, Frederick, 21701");
    expect(s.hours).toBe("24 hours daily");
    expect(s.networkUrl).toBe("https://chargepoint.com");
  });

  it("drops non-available stations (planned / temporarily out)", () => {
    expect(normalizeEvFeature(attrs({ Status_Code: "P" }))).toBeNull();
    expect(normalizeEvFeature(attrs({ Status_Code: "T" }))).toBeNull();
  });

  it("drops points outside the Frederick County ring", () => {
    expect(normalizeEvFeature(attrs({ Longitude: TANEYTOWN.lng, Latitude: TANEYTOWN.lat }))).toBeNull();
  });

  it("falls back to geometry x/y when lat/long fields are absent", () => {
    const s = normalizeEvFeature(
      attrs({ Longitude: undefined, Latitude: undefined }),
      { x: FRED.lng, y: FRED.lat },
    )!;
    expect(s).not.toBeNull();
    expect(s.lng).toBeCloseTo(FRED.lng, 4);
  });

  it("returns null when there is no coordinate at all", () => {
    expect(normalizeEvFeature(attrs({ Longitude: undefined, Latitude: undefined }), null)).toBeNull();
  });

  it("ignores zero / junk connector codes and dedups", () => {
    const s = normalizeEvFeature(attrs({ EV_Connector_Types: "J1772 J1772 NONE ??" }))!;
    expect(s.connectors).toBe("J1772");
  });
});

describe("evDetailLine", () => {
  it("leads with network, then plug counts, then connectors", () => {
    const s = normalizeEvFeature(attrs())!;
    expect(evDetailLine(s)).toBe("ChargePoint Network · 4 fast, 2 Level 2 · J1772, CCS, CHAdeMO");
  });

  it("omits empty parts cleanly", () => {
    const s = normalizeEvFeature(attrs({ EV_Network: "", EV_DC_Fast_Count: 0, EV_Connector_Types: "" }))!;
    expect(evDetailLine(s)).toBe("2 Level 2");
  });
});
