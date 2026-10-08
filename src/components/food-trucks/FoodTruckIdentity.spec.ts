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
    // dōp publishes white artwork for a dark ground, so it sits on Ink.
    expect(html).toContain('data-plate="dark"');
  });

  it("sets a light logo on Cream", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckIdentity, {
        truck: {
          slug: "blendabowl",
          name: "Blendabowl",
          cuisine: "Acai bowls & smoothies",
          kind: "food",
        },
      }),
    );

    expect(html).toContain('data-plate="light"');
    expect(html).toContain('data-size="card"');
  });

  it("falls back to the flat Truck mark, never initials or caption caps", () => {
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
    expect(html).toContain('aria-label="Guest Vendor has no logo on file yet."');
    expect(html).toContain("<svg");
    expect(html).not.toContain("GV");
    expect(html).not.toContain("Guest truck");
    expect(html).not.toContain("Frederick County");
    expect(html).not.toContain("Mobile vendor");
    expect(html).not.toContain("<img");
  });

  it("renders roster photos only when permission is recorded, and credits them after load", () => {
    const truck = {
      slug: "approved-truck",
      name: "Approved Truck",
      cuisine: "Sandwiches",
      kind: "food" as const,
      media: {
        src: "/approved/truck.webp",
        alt: "Approved Truck parked at a Frederick event",
        credit: "Approved Truck",
        permission: "owner-approved" as const,
      },
    };
    const card = renderToStaticMarkup(createElement(FoodTruckIdentity, { truck, size: "card" }));
    expect(card).toContain('data-photo-state="verified"');
    expect(card).toContain("Approved Truck parked at a Frederick event");

    // The credit waits for a decoded photo, so the server markup has none.
    const detail = renderToStaticMarkup(createElement(FoodTruckIdentity, { truck, size: "detail" }));
    expect(detail).toContain('data-photo-state="verified"');
    expect(detail).not.toContain("Photo: Approved Truck");
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

  it("links the logo source on a labelled detail view", () => {
    const html = renderToStaticMarkup(
      createElement(FoodTruckIdentity, {
        truck: {
          slug: "dop-pizza",
          name: "dōp Pizza",
          cuisine: "Wood-fired pizza",
          kind: "food",
        },
        size: "detail",
      }),
    );

    expect(html).toContain("Logo source");
    expect(html).toContain('href="https://www.doppizza.co/"');
  });
});
