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
  it("keeps County source and permission accurate in one short place credit line", () => {
    const source = placeCardPhotoPlan({ slug }, 360).sources[0];
    const markup = renderToStaticMarkup(<PlaceCardPhotoCredit source={source} loaded />);
    // The facts line ends with a hidden separator before the links line.
    expect(markup).toContain(`>Frederick County Parks &amp; Recreation</span><span class="sr-only"> · </span>`);
    expect(markup).toContain(`<a href="${image.license.url}" target="_blank" rel="noopener noreferrer">${image.license.label}</a>`);
    expect(markup).toContain(`<a href="${image.source_url}" target="_blank" rel="noopener noreferrer">Frederick County</a>`);
    expect(markup).toContain("Photo provided by ");
    expect(markup).toContain("<span data-photo-credit-edited=\"true\">edited</span>");
    expect(markup).not.toContain(image.modifications);
    expect(markup).not.toContain("Wikimedia Commons");
    expect(markup).not.toContain("<details");
  });
  it("carries the same short County credit line into an event venue photograph", () => {
    const visual = { src: image.src, caption: "Venue · Ballenger Creek Park entrance", presentation: "photo" as const, key: "test", licensedCredit: image };
    const event = renderToStaticMarkup(<EventVisualCredit visual={visual} />);
    const place = renderToStaticMarkup(<PlaceCardPhotoCredit source={placeCardPhotoPlan({ slug }, 360).sources[0]} loaded />);
    const line = (markup: string) => markup.slice(markup.indexOf("<span data-photo-credit-line"), markup.lastIndexOf("</span>") + 7);
    expect(event).toContain("Venue · Ballenger Creek Park entrance");
    expect(line(event)).toBe(line(place));
    expect(event).not.toContain(image.modifications);
    expect(event).not.toContain("Wikimedia Commons");
  });
});
