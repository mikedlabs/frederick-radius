import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { getOwnedPlacePhoto, getOwnedPlacePhotos } from "./owned-place-photos";
import { placeCardPhotoPlan, placePhotoGallerySources } from "./place-card-photo";

// Individually inspected owner exports. Hashes pin the exact public renditions,
// not library thumbnails, camera coordinates or an inferred nearby storefront.
const assets = [
  ["visitation-hotel-detail", 1123, 626, "740c911739a7ae4192d3fbbd18f3bc5961069ef9d7b0c0dd06c1b44ba954497a"],
  ["visitation-hotel-sunset", 1920, 1080, "167b0ccf0e41173cc3b932348bb0e509a3b73a616ca6d46ab4cf833c59a8122d"],
  ["carroll-creek-aerial", 1920, 1078, "20116f94967b675ddb8748468f130c0ba48dac581113a536ac191fb98b301e5c"],
  ["baker-park-detail", 1439, 561, "1e93286116404984c6ab447256a414ed469db3869dfb592267de5def016f6b77"],
  ["baker-park-sunset", 1920, 1079, "3514a04022be1bcfdfe439b3352e7a74b02b0bbeb38a5ec5f8fee5ecfdd9bd91"],
  ["carillon-sunset", 1920, 1079, "4ea55ecfc68ac8e08fc2f8aa05973935b763108144b48261bd8916669935f80a"],
  ["church-street-sunset", 1920, 1079, "d9b7687faed484d5d688f27a2827c8072ff04285a86ddcefbde665762076f316"],
  ["weinberg-patrick-street", 1920, 1440, "e6bdd6c64f55411a2e77886e4e6684fe7533a0f72dee6573c0d3457c14e7e440"],
] as const;

describe("reviewed owner-library photo cohort", () => {
  it.each(assets)("ships the reviewed %s bytes without private photo metadata", async (key, width, height, digest) => {
    const bytes = readFileSync(path.join(process.cwd(), "public/images/places", `${key}.jpg`));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
    expect(bytes.length).toBeLessThanOrEqual(600_000);
    const metadata = await sharp(bytes).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width, height });
    // GPS, original filenames, people tags and library/device identifiers must
    // remain private even when the owner has permitted the photograph itself.
    for (const field of ["exif", "xmp", "iptc", "icc"] as const) expect(metadata[field]).toBeUndefined();
  });

  it.each([
    ["visitation-hotel", "Visitation Hotel", "211 E Church St", "visitation-hotel-detail"],
    ["carroll-creek-linear-park-frederick", "Carroll Creek Linear Park", "Carroll Creek", "carroll-creek-aerial"],
    ["baker-park-frederick", "Baker Park", "121 N Bentz St", "baker-park-detail"],
  ])("keeps the photo tied to its reviewed %s listing", (slug, name, address, key) => {
    const place = clientPlaceBySlug(slug)!;
    expect(place.name).toBe(name);
    expect(place.address).toContain(address);
    expect(place.municipality).toBe("frederick");
    expect(placeCardPhotoPlan({ slug }, 360).sources[0]).toMatchObject({ kind: "owned", src: `/images/places/${key}.jpg` });
    expect(getOwnedPlacePhoto(slug)).not.toHaveProperty("captured_on");
    expect(getOwnedPlacePhoto(slug)).not.toHaveProperty("attribution");
  });

  it("retains the older reviewed photographs as local gallery alternatives", () => {
    for (const slug of ["carroll-creek-linear-park-frederick", "baker-park-frederick",
      "joseph-dill-baker-memorial-carillon-bell-tower", "st-john-the-evangelist-catholic-church-frederick", "visitation-hotel"]) {
      const owned = getOwnedPlacePhotos(slug);
      expect(owned).toHaveLength(slug === "baker-park-frederick" || slug === "visitation-hotel" ? 3 : 2);
      const sources = placePhotoGallerySources({ slug, google_photos: ["https://example.test/unverified.jpg"] }, 360);
      expect(sources.map(({ src }) => src)).toEqual(owned.map(({ src }) => src));
      expect(new Set(sources.map(({ src }) => src)).size).toBe(owned.length);
      expect(sources.every(({ kind }) => kind === "owned")).toBe(true);
    }
  });

  it.each([
    ["baker-park-frederick", "baker-park-detail", 1439, 561, "baker-park-sunset", "/images/seasons/fall/018.jpg"],
    ["visitation-hotel", "visitation-hotel-detail", 1123, 626, "visitation-hotel-sunset", "/images/places/church-street-sunset.jpg"],
  ] as const)("keeps the tighter %s primary before its full original and older gallery frame", (slug, detail, width, height, original, older) => {
    const gallery = getOwnedPlacePhotos(slug);
    expect(gallery[0]).toMatchObject({ src: `/images/places/${detail}.jpg`, width, height });
    expect(gallery[1]).toMatchObject({ src: `/images/places/${original}.jpg`, width: 1920 });
    expect(gallery[2].src).toBe(older);
    expect(placePhotoGallerySources({ slug }, 360)).toEqual(gallery);
  });

  it("keeps Weinberg's licensed color hero and adds its owner's monochrome gallery frame", () => {
    const slug = "weinberg-center-for-the-arts-frederick";
    expect(getOwnedPlacePhoto(slug)).toBeNull();
    const hero = placeCardPhotoPlan({ slug }, 360).sources[0];
    expect(hero).toMatchObject({ kind: "curated", src: "/place-photos/weinberg-exterior.jpg" });
    const sources = placePhotoGallerySources({ slug }, 360);
    expect(sources[0]).toEqual(hero);
    expect(sources[1]).toMatchObject({ kind: "owned", src: "/images/places/weinberg-patrick-street.jpg" });
    expect(sources[1]).not.toHaveProperty("photo");
    expect(sources[1]).not.toHaveProperty("attribution");
  });

  it.each(["wye-oak-tavern", "hood-college-admission-office", "c-burr-artz-public-library-frederick",
    "everedy-square-and-shab-row", "town:frederick", "__proto__"])("does not infer an owned photo for %s", slug => {
    expect(getOwnedPlacePhotos(slug)).toEqual([]);
  });
});
