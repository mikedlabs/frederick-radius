import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import RELEASE from "@/data/data-release.json";
import SOURCES from "@/data/source-registry.generated.json";
import { eventCardVisual } from "@/components/event/eventVisuals";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import { frederickCountySourceEnabled } from "@/lib/integrations/fcCountySource";
import { PLACE_RELEASE_ARTIFACTS } from "../scripts/lib/data-release.mjs";

// Exact public renditions approved after individual County object/attachment,
// catalog identity and pixel review on2026-10-24. These hashes intentionally pin
// accepted bytes; reachable URLs or a larger image inventory cannot replace them.
// The separate private originals/acceptance receipt are not CI dependencies.
const accepted = [
  {
    "slug": "ballenger-creek-park-frederick",
    "name": "Ballenger Creek Park",
    "street": "5420 Ballenger Creek Pike, Frederick, MD 21703",
    "sourceObject": 229,
    "attachment": 1,
    "sha256": "59bd22ff0b19abb8161050e84f044ded3dc02afc97ce659db19207a851c596b7",
    "bytes": 171527,
    "width": 900,
    "height": 603,
    "focal": "50% 54%"
  },
  {
    "slug": "buckeystown-park-frederick",
    "name": "Buckeystown Park",
    "street": "2171, 7221 Michaels Mill Rd, Adamstown, MD 21710",
    "sourceObject": 230,
    "attachment": 2,
    "sha256": "a5a9bb7740e334f1fe73815fb6c1af7dce526ca64033420c4981552c9f2bd881",
    "bytes": 209678,
    "width": 900,
    "height": 603,
    "focal": "50% 50%"
  },
  {
    "slug": "catoctin-creek-park-nature-center-burkittsville",
    "name": "Catoctin Creek Park & Nature Center",
    "street": "2929 Sumantown Rd, Middletown, MD 21769",
    "sourceObject": 231,
    "attachment": 3,
    "sha256": "9fab2d0a2fc32a9ba13bd364428736f0af161d5623f6f2b82999d33e7257cbcc",
    "bytes": 195172,
    "width": 900,
    "height": 603,
    "focal": "46% 55%"
  },
  {
    "slug": "kemptown-park-new-market",
    "name": "Kemptown Park",
    "street": "3456 Kemptown Church Rd, Monrovia, MD 21770",
    "sourceObject": 237,
    "attachment": 9,
    "sha256": "79d1c89c81bf7284c9b61d9b331083ae7027731fca26823f2e8ae6c6269cd17c",
    "bytes": 156626,
    "width": 900,
    "height": 603,
    "focal": "48% 52%"
  },
  {
    "slug": "loys-station-park-thurmont",
    "name": "Loys Station Park",
    "street": "13506 Old Frederick Rd, Rocky Ridge, MD 21778",
    "sourceObject": 239,
    "attachment": 11,
    "sha256": "d92c89cc5572bdfe2d00eb2d0622e1599066f8e877ec8c64c50836a576370cc9",
    "bytes": 231981,
    "width": 900,
    "height": 603,
    "focal": "65% 50%"
  },
  {
    "slug": "middletown-park-middletown",
    "name": "Middletown Park",
    "street": "CFWC+8P, 7628 Coblentz Rd, Middletown, MD 21769",
    "sourceObject": 240,
    "attachment": 12,
    "sha256": "130e058963bcc74c0842919b06751ee751aeafd678d9c9202d01c46247114d1e",
    "bytes": 222537,
    "width": 900,
    "height": 603,
    "focal": "50% 52%"
  },
  {
    "slug": "othello-regional-park-brunswick",
    "name": "Othello Regional Park",
    "street": "1901A Jefferson Pike, Knoxville, MD 21758",
    "sourceObject": 242,
    "attachment": 14,
    "sha256": "291b671dc03040e50da4c3eec81a6de7610213d5e30108a7051e592407cb5d77",
    "bytes": 97654,
    "width": 900,
    "height": 603,
    "focal": "50% 50%"
  },
  {
    "slug": "pinecliff-park-frederick",
    "name": "Pinecliff Park",
    "street": "8350 Pinecliff Park Rd, Frederick, MD 21704",
    "sourceObject": 243,
    "attachment": 15,
    "sha256": "2ee6aea289ed41989b0710c31272003b56b791b6aa694827d82068ce5e3476e9",
    "bytes": 175207,
    "width": 900,
    "height": 603,
    "focal": "50% 50%"
  },
  {
    "slug": "point-of-rocks-community-commons-park-brunswick",
    "name": "Point of Rocks Community Commons Park",
    "street": "3700 Commerce St, Point of Rocks, MD 21777",
    "sourceObject": 245,
    "attachment": 17,
    "sha256": "8a4230b49673af46462fc231e8809f12fcd0da401402eb3ebf43de17c80bc573",
    "bytes": 313981,
    "width": 900,
    "height": 603,
    "focal": "50% 53%"
  },
  {
    "slug": "utica-park-walkersville",
    "name": "Utica Park",
    "street": "10200-B Old Frederick Rd, Frederick, MD 21701",
    "sourceObject": 251,
    "attachment": 23,
    "sha256": "3d9270db8f9dc5bcdd2e1ceaa9d7993bf89aa27e83c9f8b7dc61ea026cb3c4b0",
    "bytes": 133586,
    "width": 900,
    "height": 603,
    "focal": "50% 52%"
  },
  {
    "slug": "fountain-rock-nature-center-walkersville",
    "name": "Fountain Rock Nature Center",
    "street": "8511 Nature Ctr Pl, Walkersville, MD 21793",
    "sourceObject": 258,
    "attachment": 30,
    "sha256": "cf9ac28dbb56ea8bb04f33d9a0d44c64bd8fc1378e717169130c2b22807b3378",
    "bytes": 211742,
    "width": 900,
    "height": 603,
    "focal": "52% 48%"
  },
  {
    "slug": "thurmont-recreation-center-thurmont",
    "name": "Thurmont Recreation Center",
    "street": "408 E Main St, Thurmont, MD 21788",
    "sourceObject": 265,
    "attachment": 37,
    "sha256": "215d5947c6b252fe92be02e986253b0e505e7355bc5b594f40290e619dc4e01e",
    "bytes": 97383,
    "width": 900,
    "height": 603,
    "focal": "right"
  },
  {
    "slug": "walkersville-recreation-center-walkersville",
    "name": "Walkersville Recreation Center",
    "street": "83 W Frederick St, Walkersville, MD 21793",
    "sourceObject": 268,
    "attachment": 40,
    "sha256": "27d3ec60654a371746a7658883850cc6f4845943e9669ac7176c91b91f575eaa",
    "bytes": 113128,
    "width": 900,
    "height": 603,
    "focal": "right"
  },
  {
    "slug": "brunswick-recreation-center-brunswick",
    "name": "Brunswick Recreation Center",
    "street": "400 Central Ave, Brunswick, MD 21716",
    "sourceObject": 430,
    "attachment": 207,
    "sha256": "d66f657b972e9f62f11e1b1beb668229f7f20a97447637462ee852feb61e10d0",
    "bytes": 486108,
    "width": 2048,
    "height": 1536,
    "focal": "35% 55%"
  }
] as const;
const held = ["fountaindale-park-middletown", "fountain-rock-park-walkersville",
  "old-national-pike-district-park-new-market", "urbana-district-park-new-market"] as const;
const layer = "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/survey123_4590893d5fdc4e6ab6d653f985715200_results/FeatureServer/0";

function photo(slug: typeof accepted[number]["slug"]) {
  return CREDITED_LOCAL_PLACE_PHOTOS[slug];
}

afterEach(() => vi.unstubAllEnvs());

describe("individually reviewed County local photographs", () => {
  it("ships exactly the fourteen accepted County bindings and excludes the four held originals", () => {
    const county = Object.entries(CREDITED_LOCAL_PLACE_PHOTOS)
      .filter(([, entry]) => entry.image.src.startsWith("/place-photos/county-"));
    expect(county.map(([slug]) => slug).sort()).toEqual(accepted.map(row => row.slug).sort());
    for (const slug of held) {
      expect(CREDITED_LOCAL_PLACE_PHOTOS).not.toHaveProperty(slug);
      expect(existsSync(resolve("public/place-photos", `county-${slug}.jpg`))).toBe(false);
    }
    expect(accepted.reduce((sum, row) => sum + row.bytes, 0)).toBe(2_816_310);
  });

  it.each(accepted)("retains the exact approved $slug bytes, dimensions and privacy cleanup", async row => {
    const entry = photo(row.slug);
    const file = `public/place-photos/county-${row.slug}.jpg`;
    const bytes = readFileSync(resolve(file));
    expect(bytes.length).toBe(row.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(row.sha256);
    expect(entry.review.sha256).toBe(row.sha256);
    expect(entry.file).toBe(`county-${row.slug}.jpg`);
    expect(entry.review).not.toHaveProperty("captured_on");
    const metadata = await sharp(bytes).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: row.width, height: row.height });
    // ICC is intentionally preserved for unchanged documentary color. Personal
    // metadata is removed losslessly; the encoded image is never enlarged.
    for (const field of ["exif", "xmp", "iptc"] as const) expect(metadata[field]).toBeUndefined();
    expect(PLACE_RELEASE_ARTIFACTS).toContain(file);
    expect(RELEASE.streams.places.artifacts.find(item => item.path === file)).toMatchObject({
      sha256: row.sha256, bytes: row.bytes,
    });
  });

  it.each(accepted)("keeps $slug tied to its exact catalog site, County credit and reviewed framing", row => {
    const entry = photo(row.slug);
    const catalog = clientPlaceBySlug(row.slug);
    expect(catalog).toMatchObject({ slug: row.slug, name: row.name, address: row.street });
    expect(entry.preferLocal).toBe(true);
    expect(entry.objectPosition).toBe(row.focal);
    expect(entry.image.source_url).toBe(`${layer}/${row.sourceObject}/attachments/${row.attachment}`);
    expect(entry.image.creator).toBe("Frederick County Parks & Recreation");
    expect(entry.image.license.label).toBe("Used with permission");
    expect(new URL(entry.image.license.url).hostname.replace(/^www\./, "")).toBe("recreater.com");
    expect(entry.image.modifications).toContain("capture date unknown");
    expect(entry.image.modifications).toContain("removed losslessly");
    const planned = placeCardPhotoPlan({ slug: row.slug }, 360).sources[0];
    expect(planned).toMatchObject({ kind: "curated", src: entry.image.src,
      alt: entry.image.alt, objectPosition: row.focal,
      photo: { author: entry.image.creator, source_url: entry.image.source_url,
        license: entry.image.license.label, licenseUrl: entry.image.license.url } });
    const visual = eventCardVisual({ source: "dfp", source_url: "https://example.test/event",
      venue_place_slug: row.slug }, { venuePhotos: "free-reviewed" });
    expect(visual).toMatchObject({ src: entry.image.src, presentation: "photo", objectPosition: row.focal,
      licensedCredit: { creator: entry.image.creator, source_url: entry.image.source_url, license: entry.image.license } });
    expect(visual?.caption).toMatch(/^Venue · .* (entrance|exterior)$/);
  });

  it("keeps distinct facilities and similarly named parks separate", () => {
    expect(photo("fountain-rock-nature-center-walkersville").image.source_url).toContain("/258/attachments/30");
    expect(CREDITED_LOCAL_PLACE_PHOTOS).not.toHaveProperty("fountain-rock-park-walkersville");
    expect(photo("point-of-rocks-community-commons-park-brunswick").image.source_url).toContain("/245/attachments/17");
    expect(CREDITED_LOCAL_PLACE_PHOTOS).not.toHaveProperty("point-of-rocks-community-park-brunswick");
    expect(CREDITED_LOCAL_PLACE_PHOTOS).not.toHaveProperty("middletown-skate-spot-pump-track");
  });

  it("records selected-photo permission while keeping the broad County source pending review and gated", () => {
    const source = SOURCES.find(row => row.id === "fc_recreation_locations");
    expect(source).toMatchObject({ status: "pending_review", collection: null });
    expect(source?.license).toContain("written data and attachment-photo reuse permission confirmed");
    expect(source?.license).toContain("not an open license");
    vi.stubEnv("FREDERICK_COUNTY_GIS_ENABLED", "1");
    vi.stubEnv("FREDERICK_COUNTY_GIS_REUSE_APPROVED", "");
    vi.stubEnv("FREDERICK_COUNTY_GIS_APPROVED_SOURCES", "");
    expect(frederickCountySourceEnabled("fc_recreation_locations")).toBe(false);
    vi.stubEnv("FREDERICK_COUNTY_GIS_REUSE_APPROVED", "1");
    vi.stubEnv("FREDERICK_COUNTY_GIS_APPROVED_SOURCES", "fc_county_parks");
    expect(frederickCountySourceEnabled("fc_recreation_locations")).toBe(false);
  });
});
