import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GoogleContentReportLink,
  GooglePhotoAttributionLine,
  GoogleReviewAttribution,
  googlePhotoAttributionForUrl,
  googlePhotoNameFromUrl,
  safeGoogleReportUrl,
} from "./GoogleAttribution";

const first = {
  photo_name: "places/ChIJtest/photos/first",
  google_maps_uri: "https://www.google.com/maps/photos/first",
  authors: [{ display_name: "First photographer" }],
};
const second = {
  photo_name: "places/ChIJtest/photos/second",
  google_maps_uri: "https://www.google.com/maps/photos/second",
  authors: [{ display_name: "Second photographer" }],
};

describe("Google photo attribution lookup", () => {
  it("pairs a displayed proxy photo with its exact source metadata", () => {
    const url = "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Fsecond&w=800";
    expect(googlePhotoNameFromUrl(url)).toBe(second.photo_name);
    expect(googlePhotoAttributionForUrl(url, [first, second])).toEqual(second);
  });

  it("does not guess an attribution when the photo cannot be matched", () => {
    expect(googlePhotoAttributionForUrl("/images/local-photo.jpg", [first])).toBeUndefined();
  });

  it("marks the photo credit as inline attribution rather than a standalone action", () => {
    const html = renderToStaticMarkup(createElement(GooglePhotoAttributionLine, {
      attribution: first,
    }));
    expect(html).toContain('data-inline-prose="true"');
    expect(html).toContain("First photographer");
  });
});

describe("Google content reporting links", () => {
  it("accepts only HTTPS Google report URLs", () => {
    expect(safeGoogleReportUrl("https://www.google.com/local/review/report?id=1"))
      .toBe("https://www.google.com/local/review/report?id=1");
    expect(safeGoogleReportUrl("http://www.google.com/local/review/report?id=1")).toBeUndefined();
    expect(safeGoogleReportUrl("https://example.com/report?id=1")).toBeUndefined();
  });

  it("renders report actions for photos and reviews", () => {
    const report = "https://www.google.com/local/review/report?id=1";
    const photoHtml = renderToStaticMarkup(createElement(GoogleContentReportLink, {
      href: report,
      label: "Report photo",
    }));
    const reviewHtml = renderToStaticMarkup(createElement(GoogleReviewAttribution, {
      author: "Frederick Neighbor",
      reviewFlagContentUri: report,
    }));
    expect(photoHtml).toContain("Report photo");
    expect(reviewHtml).toContain("Report review");
  });
});
