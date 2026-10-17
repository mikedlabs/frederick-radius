import { existsSync } from "node:fs";
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
});
