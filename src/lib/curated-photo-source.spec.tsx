import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { curatedPhotoSourceLabel } from "./curated-photo-source";
import { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import { placeCardPhotoPlan } from "./place-card-photo";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";

const slug = "ballenger-creek-park-frederick";
const image = CREDITED_LOCAL_PLACE_PHOTOS[slug].image;

describe("reviewed photograph source credit", () => {
  it("identifies the exact County dataset without relabeling another ArcGIS owner", () => {
    expect(curatedPhotoSourceLabel(image.source_url)).toBe("Frederick County");
    expect(curatedPhotoSourceLabel("https://services5.arcgis.com/another-owner/FeatureServer/0/1/attachments/1")).toBe("Photo source");
    expect(curatedPhotoSourceLabel("https://commons.wikimedia.org/wiki/File:example.jpg")).toBe("Wikimedia Commons");
    expect(curatedPhotoSourceLabel("https://commons.wikimedia.org.example.com/image.jpg")).toBe("Photo source");
  });
  it.each([false, true])("keeps County source, permission and modifications accurate in a place credit (disclosure %s)", (discloseModifications) => {
    const source = placeCardPhotoPlan({ slug }, 360).sources[0];
    const markup = renderToStaticMarkup(<PlaceCardPhotoCredit source={source} loaded discloseModifications={discloseModifications} />);
    expect(markup).toContain("Frederick County");
    expect(markup).toContain("Photo provided by Frederick County Parks &amp; Recreation");
    expect(markup).toContain(image.source_url);
    expect(markup).toContain(image.license.url);
    expect(markup).toContain(image.license.label);
    expect(markup).toContain(image.modifications);
    expect(markup).not.toContain("Wikimedia Commons");
    if (discloseModifications) expect(markup).toContain("Photo details");
  });
  it("carries the same accurate County credit into an event venue photograph", () => {
    const markup = renderToStaticMarkup(<EventVisualCredit visual={{ src: image.src, caption: "Venue · Ballenger Creek Park entrance", presentation: "photo", key: "test", licensedCredit: image }} />);
    expect(markup).toContain("Photo provided by Frederick County Parks &amp; Recreation");
    expect(markup).toContain("Frederick County</a>");
    expect(markup).toContain(image.license.label);
    expect(markup).not.toContain("Wikimedia Commons");
  });
});
