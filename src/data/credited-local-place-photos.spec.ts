import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HISTORY } from "./history";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "./credited-local-place-photos";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { curatedPhotoUrl, getLandmarkPhoto } from "@/lib/integrations/wikimedia";

const identities = [
  ["schifferstadt-architectural-museum-frederick", "schifferstadt", "Schifferstadt Architectural Museum"],
  ["hessian-barracks-frederick-maryland", "hessian-barracks", "Hessian Barracks Frederick Maryland"],
  ["co-canal-lock-30-brunswick", "co-canal", "C&O Canal Lock 30"],
  ["new-market-historic-district-new-market", "new-market-antiques", "New Market Historic District"],
  ["catoctin-mountain-park", "catoctin-mountain-park", "Catoctin Mountain Park"],
] as const;

describe("reviewed local licensed place identity", () => {
  it.each([
    ["delaplaine-arts-center-frederick", "Delaplaine Arts Center", "40 S Carroll St"],
    ["weinberg-center-for-the-arts-frederick", "Weinberg Center for the Arts", "20 W Patrick St"],
    ["c-burr-artz-public-library-frederick", "C. Burr Artz Public Library", "110 E Patrick St"],
  ] as const)("binds reviewed local venue bytes and public reuse records to %s", (slug, name, address) => {
    const record = CREDITED_LOCAL_PLACE_PHOTOS[slug];
    expect(clientPlaceBySlug(slug)).toMatchObject({ name, address, municipality: "frederick" });
    const bytes = readFileSync(path.join(process.cwd(), "public", record.image.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.review.sha256);
    expect(bytes.byteLength).toBeLessThan(500_000);
    expect(record.review.reviewed_on).toBe("2026-10-19");
    expect(record.image.modifications).toContain("rendition stored unchanged");
    expect(record.image.license.url).toMatch(/^https:\/\/creativecommons\.org\//);
    expect(record.image.creator).not.toBe("");
    const photo = getLandmarkPhoto(slug)!;
    expect(photo).toMatchObject({ localSrc: record.image.src, author: record.image.creator,
      source_url: record.image.source_url, license: record.image.license.label,
      licenseUrl: record.image.license.url, verified: true });
    expect(curatedPhotoUrl(photo, 720)).toBe(record.image.src);
    expect(decodeURIComponent(new URL(photo.source_url).pathname).replaceAll("_", " "))
      .toBe(`/wiki/File:${record.file}`);
  });

  it.each(identities)("keeps the existing History record and local bytes bound to the actual %s destination", (slug, historySlug, name) => {
    const record = CREDITED_LOCAL_PLACE_PHOTOS[slug];
    expect(clientPlaceBySlug(slug)?.name).toBe(name);
    expect(HISTORY.find((entry) => entry.slug === historySlug)?.image).toBe(record.image);
    expect(existsSync(path.join(process.cwd(), "public", record.image.src))).toBe(true);
    const photo = getLandmarkPhoto(slug)!;
    expect(photo).toMatchObject({ file: record.file, localSrc: record.image.src,
      author: record.image.creator, license: record.image.license.label, licenseUrl: record.image.license.url,
      source_url: record.image.source_url, modifications: record.image.modifications, verified: true });
    expect(curatedPhotoUrl(photo, 208)).toBe(record.image.src);
    expect(decodeURIComponent(new URL(photo.source_url).pathname)).toBe(`/wiki/File:${record.file}`);
  });

  it.each([
    ["city-hall-8", "frederick-county-established", "City Hall", "101 N Court St", "frederick"],
    ["mount-st-marys-university-emmitsburg", "mount-st-marys-founded", "Mount St. Mary's University", "16300 Old Emmitsburg Rd, Emmitsburg, MD 21727", "emmitsburg"],
    ["barbara-fritchie-house-frederick", "barbara-fritchie-flag", "Barbara Fritchie House", "Barbara Fritchie House, 154 W Patrick St, Frederick, MD 21701", "frederick"],
  ] as const)("reuses the complete existing licensed History source for the exact %s place", (slug, historySlug, name, address, municipality) => {
    const record = CREDITED_LOCAL_PLACE_PHOTOS[slug];
    expect(clientPlaceBySlug(slug)).toMatchObject({ name, address, municipality });
    expect(HISTORY.find((entry) => entry.slug === historySlug)?.image).toEqual(record.image);
    const bytes = readFileSync(path.join(process.cwd(), "public", record.image.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.review.sha256);
    expect(record.review.reviewed_on).toBe("2026-10-20");
    expect(record.image.creator).not.toBe("");
    expect(record.image.modifications).toContain("crop the image responsively");
    expect(record.image.license.url).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by-sa\//);
    const photo = getLandmarkPhoto(slug)!;
    expect(photo).toMatchObject({ file: record.file, localSrc: record.image.src,
      author: record.image.creator, source_url: record.image.source_url,
      license: record.image.license.label, licenseUrl: record.image.license.url,
      modifications: record.image.modifications, verified: true });
    expect(curatedPhotoUrl(photo, 144)).toBe(record.image.src);
    expect(curatedPhotoUrl(photo, 1200)).toBe(record.image.src);
    expect(decodeURIComponent(new URL(photo.source_url).pathname)).toBe(`/wiki/File:${record.file}`);
    if (slug === "barbara-fritchie-house-frederick") expect(photo.preferCurated).toBe(true);
  });

  it("does not assign the campus chapel to nearby merchants or similarly named places", () => {
    for (const slug of ["mount-st-marys-university-bookstore-emmitsburg", "saxbys-at-mount-st-marys-university-emmitsburg", "mount-st-marys-emmitsburg", "nha-tho-mount-st-marys-university-emmitsburg"]) {
      expect(clientPlaceBySlug(slug)).toBeDefined();
      expect(getLandmarkPhoto(slug)).toBeNull();
    }
  });

  it("binds the unaltered Brewer's Alley exterior to its exact venue, Flickr source and older license", () => {
    const slug = "brewers-alley-frederick";
    const record = CREDITED_LOCAL_PLACE_PHOTOS[slug];
    expect(clientPlaceBySlug(slug)).toMatchObject({ name: "Brewer's Alley", address: "124 N Market St", municipality: "frederick" });
    expect(record.provenance).toMatchObject({
      title: "Brewer's Alley, Frederick", captured_on: "2004-10-26",
      original_source_url: "https://www.flickr.com/photos/54555810@N00/374477611/",
      original_file_url: "https://upload.wikimedia.org/wikipedia/commons/5/59/Downtown_frederick_maryland.jpg",
    });
    const originalDigest = "c658a191257a37116c83a02aeac5cb41ac1236d8fc9850882774810bcffbd5ec";
    const bytes = readFileSync(path.join(process.cwd(), "public", record.image.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(originalDigest);
    expect(record.provenance.sha256).toBe(originalDigest);
    expect(getLandmarkPhoto(slug)).toMatchObject({
      file: "Downtown_frederick_maryland.jpg", localSrc: "/place-photos/brewers-alley-2004.jpg",
      author: "Stacy (Rambling Traveler)", source_url: record.image.source_url,
      license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      modifications: record.image.modifications, verified: true,
    });
    expect(record.image.modifications).toContain(record.provenance.title);
    expect(record.image.modifications).toContain("Side alley exterior, October 26, 2004");
    expect(record.image.modifications).toContain("Original file unchanged; display may resize or crop.");
    expect(getLandmarkPhoto(slug)?.preferCurated).toBeUndefined();
    expect(getLandmarkPhoto("brewers-alley")).toBeNull();
  });
});
