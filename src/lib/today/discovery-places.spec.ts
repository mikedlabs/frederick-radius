import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_DISCOVERY_IDENTITIES, localDiscoveryPlaces } from "./discovery-places";
import * as photos from "@/lib/place-card-photo";
import { MUNICIPALITIES } from "@/data/municipalities";

const rows = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/places-client.json", import.meta.url)), "utf8")) as Array<{
  slug: string; name: string; municipality: string;
}>;

describe("reviewed local discovery identities", () => {
  it("matches the exact canonical name and municipality for every editorial selection", () => {
    expect(new Set(LOCAL_DISCOVERY_IDENTITIES.map(place => place.slug)).size).toBe(LOCAL_DISCOVERY_IDENTITIES.length);
    for (const place of LOCAL_DISCOVERY_IDENTITIES) {
      const exact = rows.find(row => row.slug === place.slug);
      expect(exact, place.slug).toBeDefined(); expect(exact!.name, place.slug).toBe(place.name);
      expect(exact!.municipality, place.slug).toBe(place.municipality);
    }
  });

  it("limits county and Frederick to the two deliberate owned scenic leads", () => {
    const expected = ["joseph-dill-baker-memorial-carillon-bell-tower", "sophie-madigans-playground-frederick"];
    expect(localDiscoveryPlaces("county").map(place => place.slug)).toEqual(expected);
    expect(localDiscoveryPlaces("town:frederick").map(place => place.slug)).toEqual(expected);
    expect(localDiscoveryPlaces(null).map(place => place.slug)).toEqual(expected);
    expect(localDiscoveryPlaces("county").every(place => place.photoPlan.sources.every(source => source.kind === "owned"))).toBe(true);
  });

  it("never substitutes a foreign town or pretends a Near me device location is known", () => {
    for (const town of MUNICIPALITIES) {
      const selected = localDiscoveryPlaces(`town:${town.slug}`);
      expect(selected.every(place => place.municipality === town.slug), town.slug).toBe(true);
    }
    expect(localDiscoveryPlaces("nearme")).toEqual([]);
  });

  it("resolves existing bundled bytes with exact source credit and no provider source", () => {
    for (const identity of LOCAL_DISCOVERY_IDENTITIES) {
      const selected = localDiscoveryPlaces(`town:${identity.municipality}`).find(place => place.slug === identity.slug)!;
      expect(selected, identity.slug).toBeDefined(); expect(selected.photoPlan.sources.length).toBeGreaterThan(0);
      const original = photos.placeCardPhotoPlan({ slug: identity.slug }, 400);
      for (const source of selected.photoPlan.sources) {
        expect(source.kind).not.toBe("google"); expect(source.src).not.toMatch(/^(?:https?:|\/\/|\/api\/)/);
        expect(existsSync(fileURLToPath(new URL(`../../../public${source.src}`, import.meta.url))), source.src).toBe(true);
        expect(source).toEqual(original.sources.find(candidate => candidate.kind === source.kind && candidate.src === source.src));
        expect(source.alt.length).toBeGreaterThan(12);
        if (source.kind === "curated") {
          expect(source.photo.verified).toBe(true); expect(source.photo.author).toBeTruthy(); expect(source.photo.license).toBeTruthy(); expect(source.photo.source_url).toBeTruthy();
        }
      }
    }
  });

  it("rejects remote transport and unverified merchant references even if a future registry plan offers them", () => {
    const candidates: photos.PlaceCardPhotoSource[] = [
      { kind: "owned", src: "https://unreviewed.example/photo.jpg", alt: "Unaccepted fixture" },
      { kind: "owned", src: "//unreviewed.example/photo.jpg", alt: "Unaccepted fixture" },
      { kind: "owned", src: "/api/place-photo?name=fixture", alt: "Unaccepted fixture" },
      { kind: "owned", src: "/images/merchant-reference.jpg", alt: "Unaccepted fixture", referenceContext: "appearance-unverified" },
    ];
    const spy = vi.spyOn(photos, "placeCardPhotoPlan").mockReturnValue({ key: "unsafe-fixture", sources: candidates });
    try { expect(localDiscoveryPlaces("county")).toEqual([]); } finally { spy.mockRestore(); }
  });
});
