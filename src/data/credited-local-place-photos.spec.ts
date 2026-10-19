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
