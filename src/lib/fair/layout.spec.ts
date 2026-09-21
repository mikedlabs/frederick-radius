import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { greatFrederickFair2026Vendors } from "@/data/fair/great-frederick-fair-2026-vendors";
import { findFairLayoutBooth, parseFairLayoutData, searchFairLayoutVendors } from "./layout";

const source = JSON.parse(readFileSync(new URL("../../../public/fair/layouts/great-frederick-fair-2026.json", import.meta.url), "utf8"));
const fresh = () => structuredClone(source);

describe("reviewed Fair booth layout", () => {
  it("keeps the original source artwork bytes and intrinsic dimensions tied to their review record", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../docs/audits/2026-09-21-fair-layout-release.json", import.meta.url), "utf8"));
    const data = parseFairLayoutData(source);
    for (const map of data.maps) {
      const bytes = readFileSync(new URL(`../../../public${map.backgroundUrl}`, import.meta.url));
      const reviewed = manifest.maps.find((item: { mapId: string }) => item.mapId === map.id);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(reviewed.artworkSha256);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([map.imageWidth, map.imageHeight]);
    }
  });

  it("resolves the entire reviewed inventory with reciprocal map joins", () => {
    const data = parseFairLayoutData(source);
    expect(data.maps.map((map) => [map.id, map.booths.length])).toEqual([["9564", 76], ["9565", 256], ["9566", 179]]);
    expect(data.vendors).toHaveLength(155);
    expect(data.vendors.reduce((sum, vendor) => sum + vendor.boothIds.length, 0)).toBe(411);
    const richIds = data.vendors.flatMap((vendor) => vendor.richProfileId ? [vendor.richProfileId] : []);
    expect(richIds.sort()).toEqual(greatFrederickFair2026Vendors.map((vendor) => vendor.id).sort());
    expect(data.permission).toMatchObject({ basis: "owner-attestation", attestedOn: "2026-09-21" });
  });

  it("finds a vendor and its exact source booths across all sections", () => {
    const data = parseFairLayoutData(source);
    expect(searchFairLayoutVendors(data, "Rad Pies").map((vendor) => vendor.id)).toEqual(["eventhub-2008147"]);
    expect(searchFairLayoutVendors(data, "587").map((vendor) => vendor.id)).toEqual(["eventhub-2008147"]);
    expect(searchFairLayoutVendors(data, "booth 587").map((vendor) => vendor.id)).toEqual(["eventhub-2008147"]);
    expect(searchFairLayoutVendors(data, "58").some((vendor) => vendor.id === "eventhub-2008147")).toBe(false);
    expect(searchFairLayoutVendors(data, "WHITE rabbit")[0].boothIds).toEqual(["9566:3353619", "9566:3353618"]);
    expect(findFairLayoutBooth(data, "9566:3353619")?.booth.label).toBe("587");
    expect(findFairLayoutBooth(data, "9564:3353619")).toBeUndefined();
    expect(searchFairLayoutVendors(data, "no such exhibitor zzzyyy")).toEqual([]);
    expect(searchFairLayoutVendors(data, " ")).toHaveLength(155);
  });

  it("preserves source rotation, intrinsic image dimensions and an unassigned unlabeled space", () => {
    const data = parseFairLayoutData(source);
    expect(data.maps[0]).toMatchObject({ width: 1600, height: 1460, imageWidth: 3334, imageHeight: 3042 });
    expect(data.maps[2].width * data.maps[2].imageHeight / data.maps[2].imageWidth).toBeCloseTo(1918.08096);
    expect(data.maps.flatMap((map) => map.booths).some((booth) => booth.rotationDeg === 341)).toBe(true);
    expect(findFairLayoutBooth(data, "9566:3353654")?.booth).toMatchObject({ label: "", vendorIds: [] });
    expect(data.maps.flatMap((map) => map.annotations ?? []).some((item) => item.text === "Click to edit")).toBe(false);
    expect(data.maps.flatMap((map) => map.annotations ?? []).some((item) => item.fontSize === 0)).toBe(true);
  });

  it.each(["maps", "vendors"])("rejects empty %s", (field) => {
    const data = fresh(); data[field] = [];
    expect(() => parseFairLayoutData(data)).toThrow();
  });

  it("rejects duplicate identities and references instead of silently repairing a release", () => {
    const duplicateVendor = fresh(); duplicateVendor.vendors.push(duplicateVendor.vendors[0]);
    expect(() => parseFairLayoutData(duplicateVendor)).toThrow("Duplicate vendor");
    const duplicateBooth = fresh(); duplicateBooth.maps[0].booths.push(duplicateBooth.maps[0].booths[0]);
    expect(() => parseFairLayoutData(duplicateBooth)).toThrow("Duplicate booth");
    const duplicateReference = fresh(); duplicateReference.vendors[0].boothIds.push(duplicateReference.vendors[0].boothIds[0]);
    expect(() => parseFairLayoutData(duplicateReference)).toThrow("Duplicate booth reference");
  });

  it("rejects unknown joins, out-of-bounds geometry, unsafe assets, and private extra fields", () => {
    const unknownBooth = fresh(); unknownBooth.vendors[0].boothIds.push("9564:99999");
    expect(() => parseFairLayoutData(unknownBooth)).toThrow("Unresolved booth");
    const unknownVendor = fresh(); unknownVendor.maps[0].booths[0].vendorIds.push("eventhub-99999");
    expect(() => parseFairLayoutData(unknownVendor)).toThrow("Unresolved vendor");
    const wrongBounds = fresh(); wrongBounds.maps[0].booths[0].width = 20_000;
    expect(() => parseFairLayoutData(wrongBounds)).toThrow("exceeds its source canvas");
    for (const url of ["javascript:alert(1)", "https://elsewhere.example/layout.png", "/fair/layouts/../../secret.png", "//elsewhere.example/map.png"]) {
      const unsafe = fresh(); unsafe.maps[0].backgroundUrl = url;
      expect(() => parseFairLayoutData(unsafe)).toThrow();
    }
    const privateField = fresh(); privateField.vendors[0].contactEmail = "private@example.test";
    expect(() => parseFairLayoutData(privateField)).toThrow();
  });
});
