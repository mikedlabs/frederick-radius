import { describe, expect, it } from "vitest";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import { getLandmarkPhoto } from "./wikimedia";

describe("credited local photograph metadata adapter", () => {
  it("retains exact capture metadata and existing licensed image identities", () => {
    for (const [slug, record] of Object.entries(CREDITED_LOCAL_PLACE_PHOTOS)) {
      const photo = getLandmarkPhoto(slug)!;
      const capturedOn = "review" in record && "captured_on" in record.review ? record.review.captured_on
        : "provenance" in record && "captured_on" in record.provenance ? record.provenance.captured_on : undefined;
      expect(photo.capturedOn, slug).toBe(capturedOn);
      expect(photo.localSrc, slug).toBe(record.image.src);
      expect(photo.source_url, slug).toBe(record.image.source_url);
      expect(photo.licenseUrl, slug).toBe(record.image.license.url);
      expect(photo.modifications, slug).toBe(record.image.modifications);
    }
  });
  it("retains Brewer's existing original-source capture date", () => {
    expect(CREDITED_LOCAL_PLACE_PHOTOS["brewers-alley-frederick"].provenance.captured_on).toBe("2004-10-26");
    expect(getLandmarkPhoto("brewers-alley-frederick")?.capturedOn).toBe("2004-10-26");
  });
  it("does not convert a recent review into a photograph's capture date", () => {
    const sabor = getLandmarkPhoto("sabor-de-cuba-restaurant-frederick")!;
    expect(sabor.capturedOn).toBe("2018-04-01");
    expect(sabor.capturedOn).not.toBe(CREDITED_LOCAL_PLACE_PHOTOS["sabor-de-cuba-restaurant-frederick"].review.reviewed_on);
    expect(CREDITED_LOCAL_PLACE_PHOTOS["ballenger-creek-park-frederick"].review.reviewed_on).toBeTruthy();
    expect(getLandmarkPhoto("ballenger-creek-park-frederick")?.capturedOn).toBeUndefined();
    expect(getLandmarkPhoto("unknown-offline-place")).toBeNull();
  });
});
