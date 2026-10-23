import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { HISTORY } from "./history";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "./credited-local-place-photos";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { curatedPhotoUrl, getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { placeCardPhotoPlan, selectedPlaceCardPhoto } from "@/lib/place-card-photo";

const identities = [
  ["schifferstadt-architectural-museum-frederick", "schifferstadt", "Schifferstadt Architectural Museum"],
  ["hessian-barracks-frederick-maryland", "hessian-barracks", "Hessian Barracks Frederick Maryland"],
  ["co-canal-lock-30-brunswick", "co-canal", "C&O Canal Lock 30"],
  ["new-market-historic-district-new-market", "new-market-antiques", "New Market Historic District"],
  ["catoctin-mountain-park", "catoctin-mountain-park", "Catoctin Mountain Park"],
] as const;

describe("reviewed local licensed place identity", () => {
  it.each([
    { slug: "frederick-station", name: "Frederick Station", address: "Frederick", municipality: "frederick", file: "Frederick MARC station, July 2015.jpg", src: "/place-photos/frederick-marc-station-2015.jpg", creator: "Art Anderson", captured: "2015-07-19", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", width: 1280, height: 948, bytes: 526603, sha256: "bbf2d77adbcb5ddb7049661f77582806b9159469da7b341231afa88f5bddeca6", objectPosition: "center" },
    { slug: "heritage-frederick", name: "Heritage Frederick", address: "24 E Church St Frederick", municipality: "frederick", file: "Loats Orphanage.jpg", src: "/place-photos/heritage-frederick-exterior-2009.jpg", creator: "ZeWrestler", captured: "2009-09-28", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", width: 1280, height: 960, bytes: 383963, sha256: "e78293fb6ad0966b1a6ff80fd2716ce81d51a73be132d4bae5d29e2a4b10321c", objectPosition: "center" },
    { slug: "thurmont-square-park-thurmont", name: "Thurmont Square Park", address: "1 N Church St, Thurmont, MD 21788", municipality: "thurmont", file: "Thurmont Town Square Park.jpg", src: "/place-photos/thurmont-square-park-2012.jpg", creator: "CraigShipp.com Photos - Events / People / Places from Sarasota, FL & Thurmont, MD, USA", captured: "2012-05-31", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/", width: 1280, height: 853, bytes: 330516, sha256: "600544504046f04b67ae20f2a6078d7bb17cf3947f4c06610397a6a30696b4fe", objectPosition: "top" },
    { slug: "heritage-farm-park-walkersville", name: "Heritage Farm Park", address: "9236 Devilbiss Bridge Rd, Walkersville, MD 21793", municipality: "walkersville", file: "Harris Farmhouse Walkersville, MD1.jpg", src: "/place-photos/heritage-farm-park-harris-farmhouse-2010.jpg", creator: "Acroterion", captured: "2010-04-02", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", width: 1280, height: 733, bytes: 495793, sha256: "420a43367dc690e4fc320149b342ebf45fa969ef5e9211d94e3d8dfdb0924a71", objectPosition: "right" },
    { slug: "sabor-de-cuba-restaurant-frederick", name: "Sabor de Cuba Restaurant", address: "9 E Patrick St, Frederick, MD 21701", municipality: "frederick", file: "Sabor de Cuba 02.jpg", src: "/place-photos/sabor-de-cuba-entrance-2018.jpg", creator: "Bohemian Baltimore", captured: "2018-04-01", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", width: 1280, height: 1707, bytes: 752989, sha256: "fc0d9af140bc841b50961d89aadb46cbdf1c037ec46df625bdadda3ca180d114", objectPosition: "top" },
    { slug: "francis-scott-key-grave-and-monument", name: "Francis Scott Key Grave and Monument", address: "515 S Market St", municipality: "frederick", file: "Francis Scott Key Monument (March 2024).jpg", src: "/place-photos/francis-scott-key-monument-2024.jpg", creator: "Engineerchange", captured: "2024-03-02", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", width: 1280, height: 853, bytes: 348832, sha256: "138b07aebb5e16aca7ccf428c84b70c1475a874fc7ed882363b0231c4a3f7f82", objectPosition: "left" },
    { slug: "rose-hill-manor-park-museums-frederick", name: "Rose Hill Manor Park & Museums", address: "1611 N Market St, Frederick, MD 21701", municipality: "frederick", file: "Rose Hill Manor - Front of Mansion.jpg", src: "/place-photos/rose-hill-manor-exterior-2019.jpg", creator: "LittleLuckyMd", captured: "2019-09-05", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", width: 1280, height: 960, bytes: 286166, sha256: "34f8b85edc496cdfcd765968c639d5c3a03b175127ff0db582b0da1943f09089", objectPosition: "center" },
    { slug: "historic-utica-covered-bridge-thurmont", name: "Historic Utica Covered Bridge", address: "7720 Utica Rd, Thurmont, MD 21788", municipality: "thurmont", file: "Utica covered bridge MD1.jpg", src: "/place-photos/utica-covered-bridge-2022.jpg", creator: "Acroterion", captured: "2022-06-17", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", width: 1280, height: 844, bytes: 463387, sha256: "b794b20d7cf3444786ebe4bdcaf451b9b9ef6608975617035966eee892b2c0a1", objectPosition: "right" },
  ] as const)("selects reviewed, unchanged licensed bytes for the exact $slug mobile hero", async (expected) => {
    const { slug, name, address, municipality, file, src, creator, captured, license, licenseUrl, width, height, bytes: byteLength, sha256, objectPosition } = expected;
    const record = CREDITED_LOCAL_PLACE_PHOTOS[slug];
    expect(clientPlaceBySlug(slug)).toMatchObject({ name, address, municipality });
    expect(record).toMatchObject({ file, preferLocal: true, objectPosition,
      review: { captured_on: captured, reviewed_on: "2026-10-22", sha256 },
      image: { src, creator, license: { label: license, url: licenseUrl } } });
    const bytes = readFileSync(path.join(process.cwd(), "public", src));
    expect(bytes.byteLength).toBe(byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "jpeg", width, height });
    expect(decodeURIComponent(new URL(record.image.source_url).pathname).replaceAll("_", " ")).toBe(`/wiki/File:${file}`);
    expect(record.image.modifications).toContain("rendition stored unchanged");
    expect(record.image.modifications).toContain("display may resize or crop");
    const photo = getLandmarkPhoto(slug)!;
    // This also guards against a later explicit remote entry shadowing the
    // registry's local bytes, credits or reviewed focal point.
    expect(photo).toMatchObject({ file, localSrc: src, preferLocal: true, objectPosition,
      author: creator, source_url: record.image.source_url, license, licenseUrl,
      modifications: record.image.modifications, verified: true });
    expect(curatedPhotoUrl(photo, 128)).toBe(src);
    expect(curatedPhotoUrl(photo, 1200)).toBe(src);
    expect(selectedPlaceCardPhoto(placeCardPhotoPlan({ slug }, 390), null))
      .toMatchObject({ kind: "curated", src, objectPosition, photo });
  });

  it("binds the unchanged museum frontage rendition, bottom framing and full reuse rights to the exact destination", () => {
    const slug = "national-museum-civil-war-medicine-frederick";
    const record = CREDITED_LOCAL_PLACE_PHOTOS[slug];
    expect(clientPlaceBySlug(slug)).toMatchObject({ name: "National Museum of Civil War Medicine", address: "48 E Patrick St", municipality: "frederick" });
    const bytes = readFileSync(path.join(process.cwd(), "public", record.image.src));
    expect(bytes.byteLength).toBe(511207);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("dc82253150252d479cd61b150b9a6498053aa7c7a1ecbeb8ad6bc032776d17c9");
    expect(record.review).toEqual({ reviewed_on: "2026-10-22", sha256: createHash("sha256").update(bytes).digest("hex") });
    expect(getLandmarkPhoto(slug)).toMatchObject({ file: "National_Museum_of_Civil_War_Medicine_frontage.jpg",
      localSrc: "/place-photos/civil-war-medicine-frontage.jpg", objectPosition: "bottom", preferLocal: true,
      author: "NatMuseCivMed", source_url: "https://commons.wikimedia.org/wiki/File:National_Museum_of_Civil_War_Medicine_frontage.jpg",
      license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      modifications: "Wikimedia's 1,280 px rendition stored unchanged; display may resize or crop." });
    expect(curatedPhotoUrl(getLandmarkPhoto(slug)!, 128)).toBe(record.image.src);
    expect(getLandmarkPhoto("national-museum-of-civil-war-medicine")).toBeNull();
  });

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
