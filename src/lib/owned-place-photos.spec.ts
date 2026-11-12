import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { OWNED_PLACE_PHOTOS, getOwnedPlacePhoto } from "./owned-place-photos";
import { placeCardPhotoPlan, placePhotoGallerySources, recordPlaceCardPhotoResult, selectedPlaceCardPhoto } from "./place-card-photo";
import { freeSearchPlaceVisual } from "./search/place-visual";

const reviewed = [
  {
    slug: "zoes-chocolate-company",
    name: "Zoe's Chocolate Company",
    address: "121 N Market St",
    src: "/images/seasons/winter/IMG_2732.jpg",
    width: 1920, height: 2400, objectPosition: "center",
    sha256: "784d12b622f5ad4ccd4e7160c863f7511eface0ae7a936a1dc4cf89ce198ea97",
  },
  {
    slug: "sophie-madigans-playground-frederick",
    name: "Sophie & Madigan's Playground",
    address: "632 Contender Way, Frederick, MD 21703",
    src: "/images/seasons/spring/010.jpg",
    width: 1920, height: 1079, objectPosition: "center",
    sha256: "5f14890de91e95ae044b6daf15b26d96f7fafd4fd9b43bdee79e247b96882b6b",
  },
  {
    slug: "calvary-united-methodist-church-of-frederick-maryland",
    name: "Calvary United Methodist Church of Frederick Maryland",
    address: "131 W 2nd St",
    src: "/images/seasons/fall/001.jpg",
    width: 1920, height: 3413, objectPosition: "top",
    sha256: "b34a2a727b290a25dba3b68a39baf2f083103c0938f3f8ad133cc38efc794365",
  },
] as const;

describe("reviewed owned photo batch", () => {
  it.each(reviewed)("binds the inspected bytes and framing to the exact $slug identity", async (record) => {
    expect(clientPlaceBySlug(record.slug)).toMatchObject({ name: record.name, address: record.address, municipality: "frederick" });
    const photo = getOwnedPlacePhoto(record.slug)!;
    expect(photo).toMatchObject({ kind: "owned", src: record.src, width: record.width,
      height: record.height, objectPosition: record.objectPosition });
    const bytes = readFileSync(path.join(process.cwd(), "public", photo.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "jpeg", width: photo.width, height: photo.height });
    expect(photo).not.toHaveProperty("attribution");
    expect(photo).not.toHaveProperty("captured_on");
  });

  it.each(reviewed)("keeps $slug local in Find, cards and galleries without needing provider metadata", ({ slug, src, objectPosition }) => {
    for (const width of [88, 128, 360, 1200]) {
      const input = { slug };
      const plan = placeCardPhotoPlan(input, width);
      expect(plan.sources).toHaveLength(1);
      expect(selectedPlaceCardPhoto(plan, null)).toMatchObject({ kind: "owned", src, objectPosition });
      expect(freeSearchPlaceVisual(input)).toEqual(plan.sources[0]);
      expect(placePhotoGallerySources(input, width)).toEqual(plan.sources);
      const failed = recordPlaceCardPhotoResult(plan, null, src, "failed");
      expect(selectedPlaceCardPhoto(plan, failed)).toBeNull();
      expect(recordPlaceCardPhotoResult(plan, failed, src, "loaded")).toEqual(failed);
    }
  });

  it.each([
    "zoes-chocolate-co-frederick-md",
    "sophie-and-madigans-playground",
    "calvary-chapel-frederick-frederick",
    "calvary-walkersville",
    "all-saints-episcopal-church-frederick-md",
    "bentztown",
    "__proto__",
  ])("does not spread owned imagery to another name, neighbor or congregation: %s", (slug) => {
    expect(getOwnedPlacePhoto(slug)).toBeNull();
  });
});

describe("reviewed owned merchant reference context", () => {
  const flagged = ["visitation-hotel", "zoes-chocolate-company"];
  it("flags only the two explicitly reviewed undated primary business references", () => {
    expect(Object.entries(OWNED_PLACE_PHOTOS).filter(([, photo]) => photo.referenceContext)
      .map(([slug]) => slug).sort()).toEqual([...flagged].sort());
    for (const slug of flagged) {
      const photo = getOwnedPlacePhoto(slug)!;
      expect(photo.referenceContext).toBe("appearance-unverified");
      expect("capturedOn" in photo).toBe(false);
    }
  });
  it("preserves exact image identity and reference context through the shared plan", () => {
    for (const slug of flagged) {
      const expected = getOwnedPlacePhoto(slug)!;
      const source = placeCardPhotoPlan({ slug }, 360).sources[0];
      expect(source.kind).toBe("owned"); expect(source.src).toBe(expected.src); expect(source.alt).toBe(expected.alt);
      expect(source.kind === "owned" && source.referenceContext).toBe("appearance-unverified");
    }
    const creek = placeCardPhotoPlan({ slug: "carroll-creek-linear-park-frederick" }, 360).sources[0];
    expect(creek.kind).toBe("owned");
    expect(creek.kind === "owned" && creek.referenceContext).toBeUndefined();
  });
});
