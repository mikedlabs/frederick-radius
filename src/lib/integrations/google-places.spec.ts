import { describe, expect, it } from "vitest";
import { pickReview } from "./google-places";

describe("pickReview", () => {
  it("preserves the selected review's author and Google Maps links", () => {
    const selected = pickReview([
      {
        rating: 5,
        text: { text: "The parking was easy and the bathroom was very clean for our quick stop." },
        authorAttribution: { displayName: "Logistics only" },
      },
      {
        rating: 4,
        text: { text: "Thoughtful seasonal dishes, warm service, and a room that felt distinctly local." },
        authorAttribution: {
          displayName: "Frederick Neighbor",
          uri: "https://maps.google.com/maps/contrib/example",
          photoUri: "https://lh3.googleusercontent.com/example",
        },
        googleMapsUri: "https://www.google.com/maps/reviews/example",
      },
    ]);

    expect(selected).toEqual({
      snippet: "Thoughtful seasonal dishes, warm service, and a room that felt distinctly local.",
      author: "Frederick Neighbor",
      authorUri: "https://maps.google.com/maps/contrib/example",
      authorPhotoUri: "https://lh3.googleusercontent.com/example",
      googleMapsUri: "https://www.google.com/maps/reviews/example",
    });
  });

  it("returns no review when the documented rating and length filters reject all candidates", () => {
    expect(pickReview([
      { rating: 3, text: { text: "This review is long enough but below the published rating threshold." } },
      { rating: 5, text: { text: "Too short." } },
    ])).toBeUndefined();
  });
});
