import { describe, expect, it } from "vitest";

import { fairVendorSchema } from "@/lib/fair/domain";
import { greatFrederickFair2026Vendors as vendors } from "./great-frederick-fair-2026-vendors";

describe("reviewed Great Frederick Fair vendor profiles", () => {
  it("keeps stable unique identities and validates each canonical vendor", () => {
    expect(vendors.length).toBeGreaterThanOrEqual(10);
    expect(new Set(vendors.map((vendor) => vendor.id)).size).toBe(vendors.length);
    expect(new Set(vendors.map((vendor) => vendor.name)).size).toBe(vendors.length);

    for (const vendor of vendors) {
      const { id, name, kind, zoneId, booth, operatingHours, provenance } = vendor;
      expect(
        fairVendorSchema.safeParse({
          id,
          name,
          kind,
          zoneId,
          booth,
          operatingHours,
          provenance,
        }).success,
        vendor.id,
      ).toBe(true);
      expect(vendor.summary).toMatch(/\.$/);
      expect(vendor.highlights.length).toBeGreaterThan(0);
      expect(vendor.searchAliases.length).toBeGreaterThan(0);
      expect(
        new Set(vendor.searchAliases.map((alias) => alias.toLowerCase())).size,
      ).toBe(vendor.searchAliases.length);
    }
  });

  it("keeps temporary Fair references separate from permanent business hours and locations", () => {
    for (const vendor of vendors) {
      expect(vendor.zoneId.status).toBe("unknown");
      expect(vendor.operatingHours.status).toBe("unknown");
      expect(vendor.booth.status).toBe("known");
      if (vendor.booth.status === "known") {
        expect(vendor.booth.value).toMatch(/^\d+(?:, \d+)*$/);
        const boothReferences = vendor.booth.value.split(", ");
        expect(new Set(boothReferences).size).toBe(boothReferences.length);
      }
      expect(vendor).not.toHaveProperty("latitude");
      expect(vendor).not.toHaveProperty("longitude");
      expect(vendor).not.toHaveProperty("location");
    }
  });

  it("links every booth claim to the correct official Fair directory and dated provenance", () => {
    for (const vendor of vendors) {
      const directory = new URL(vendor.directoryUrl);
      expect(directory.protocol).toBe("https:");
      expect(directory.hostname).toBe("mobile.eventhub-floorplan.net");
      expect(directory.pathname).toBe("/exhibitors-g2app.php");
      expect(directory.searchParams.get("Show_ID")).toBe("18209");
      expect(directory.searchParams.get("q")).toBe(vendor.name);
      expect(vendor.provenance[0]).toMatchObject({
        publisher: "The Great Frederick Fair",
        sourceUrl: vendor.directoryUrl,
        verifiedAt: "2026-09-20T01:16:11.628Z",
      });
      expect(vendor.provenance.length).toBeGreaterThanOrEqual(1);
      for (const url of [
        vendor.websiteUrl,
        vendor.menuUrl,
        ...vendor.provenance.map((source) => source.sourceUrl),
      ]) {
        if (url) expect(new URL(url).protocol).toBe("https:");
      }
      if (vendor.menuUrl) {
        expect(vendor.menuLabel).toMatch(/restaurant menu|creamery flavor list/i);
        expect(
          vendor.provenance.some((source) => source.sourceUrl === vendor.menuUrl),
        ).toBe(true);
      }
    }
  });

  it("requires business evidence for descriptions but keeps listing-only claims limited to Fair evidence", () => {
    for (const vendor of vendors) {
      const businessSources = vendor.provenance.filter(
        (source) => source.sourceUrl !== vendor.directoryUrl,
      );
      if (vendor.id === "vendor-altmeyers-western-wear") {
        expect(vendor.summary).toBe(
          "The Fair lists Altmeyers Western Wear as a 2026 exhibitor.",
        );
        expect(vendor.provenance).toHaveLength(1);
        expect(businessSources).toEqual([]);
      } else {
        expect(businessSources.length, vendor.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("represents White Rabbit and Rad Pies as one jointly listed exhibitor", () => {
    const matches = vendors.filter((vendor) =>
      /white rabbit|rad pies/i.test(vendor.name),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "vendor-white-rabbit-rad-pies",
      name: "White Rabbit x Rad Pies",
      booth: { status: "known", value: "587, 588" },
      menuLabel: "Rad Pies restaurant menu",
    });
    expect(matches[0].searchAliases).toEqual(
      expect.arrayContaining(["White Rabbit", "Rad Pies"]),
    );
  });

  it("does not turn gaps in JB Seafood's booth references into a continuous range", () => {
    const vendor = vendors.find((item) => item.id === "vendor-jb-seafood");
    expect(vendor?.booth.status).toBe("known");
    if (vendor?.booth.status !== "known") return;
    const boothReferences = vendor.booth.value.split(", ");
    expect(boothReferences).toHaveLength(32);
    expect(boothReferences).toEqual(
      expect.arrayContaining(["235", "254", "258", "265", "276", "278", "285"]),
    );
    expect(boothReferences).not.toEqual(expect.arrayContaining(["255"]));
    expect(boothReferences).not.toEqual(expect.arrayContaining(["256"]));
    expect(boothReferences).not.toEqual(expect.arrayContaining(["257"]));
  });
});
