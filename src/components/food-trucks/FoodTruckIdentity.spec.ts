import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FoodTruckIdentity from "./FoodTruckIdentity";

describe("FoodTruckIdentity", () => {
  it("uses a locally shipped official mark when the vendor has one", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckIdentity, {
        truck: {
          slug: "dop-pizza",
          name: "dōp Pizza",
          cuisine: "Wood-fired pizza",
          kind: "food",
        },
        size: "hero",
      }),
    );

    expect(html).toContain('data-photo-state="official-mark"');
    expect(html).toContain("%2Ffood-truck-marks%2Fdop-pizza.png");
    expect(html).toContain('alt="dōp Pizza logo"');
  });

  it("uses a named identity fallback instead of an unrelated stock-food image", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckIdentity, {
        truck: {
          slug: "guest-vendor",
          name: "Guest Vendor",
          cuisine: "Guest truck",
          kind: "food",
        },
        size: "thumb",
      }),
    );

    expect(html).toContain('data-photo-state="fallback"');
    expect(html).toContain("GV");
    expect(html).toContain("Guest truck");
    expect(html).not.toContain("<img");
  });

  it("renders roster photos only when permission is recorded", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckIdentity, {
        truck: {
          slug: "approved-truck",
          name: "Approved Truck",
          cuisine: "Sandwiches",
          kind: "food",
          media: {
            src: "/approved/truck.webp",
            alt: "Approved Truck parked at a Frederick event",
            credit: "Approved Truck",
            permission: "owner-approved",
          },
        },
        size: "card",
      }),
    );

    expect(html).toContain('data-photo-state="verified"');
    expect(html).toContain("Approved Truck parked at a Frederick event");
    expect(html).toContain("Approved Truck");
  });

  it("hides a repeated card identity from assistive technology", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckIdentity, {
        truck: {
          slug: "dop-pizza",
          name: "dōp Pizza",
          cuisine: "Wood-fired pizza",
          kind: "food",
        },
        decorative: true,
      }),
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
    expect(html).not.toContain("Logo source");
  });
});
