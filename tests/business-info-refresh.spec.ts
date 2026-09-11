import { describe, expect, it } from "vitest";
import {
  mergeBusinessInfoCommerceEvidence,
  mergeBusinessInfoRefresh,
  type BusinessInfoRecord,
} from "../scripts/lib/business-info-refresh";

describe("business-info refresh merge safety", () => {
  const tempoBefore: BusinessInfoRecord = {
    name: "Tempo Di Pasta",
    commerce_links: [
      {
        type: "menu",
        url: "https://www.tempodipasta.com/menu",
        source_url: "https://www.tempodipasta.com/",
      },
      {
        type: "order",
        url: "https://www.tempodipasta.com/placeanorder",
        anchor_text: "order online",
        source_url: "https://www.tempodipasta.com/eat",
      },
      {
        type: "menu",
        url: "https://www.tempodipasta.com/s/TDP-Food-Truck-Menu.pdf",
        anchor_text: "menu pdf",
        source_url: "https://www.tempodipasta.com/menu",
      },
    ],
    commerce_source: {
      url: "https://www.tempodipasta.com/",
      checkedAt: "2026-07-29T12:40:47.382Z",
    },
  };

  it("preserves Tempo's vetted deep links and commerce provenance", () => {
    const next = mergeBusinessInfoRefresh(tempoBefore, {
      name: "Tempo Di Pasta",
      info: {
        known_for: "Tempo Di Pasta serves panini and pasta in Frederick.",
      },
      commerceLinks: [
        {
          type: "menu",
          url: "https://www.tempodipasta.com/menu/",
          anchor_text: "Menu",
          source_url: "https://www.tempodipasta.com/",
        },
      ],
      source: {
        url: "https://www.tempodipasta.com/",
        fetchedAt: "2026-07-31T18:37:33.711Z",
        contentHash: "fresh-content",
        extractorVersion: "business-deep-info-v2-plain-copy",
      },
    });

    expect(next.commerce_source).toEqual(tempoBefore.commerce_source);
    expect(next.commerce_links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "order",
          url: "https://www.tempodipasta.com/placeanorder",
        }),
        expect.objectContaining({
          type: "menu",
          url: "https://www.tempodipasta.com/s/TDP-Food-Truck-Menu.pdf",
        }),
      ]),
    );
    expect(
      next.commerce_links?.filter(
        (link) => link.url.replace(/\/$/, "") === "https://www.tempodipasta.com/menu",
      ),
    ).toHaveLength(1);
  });

  it("keeps prior facts when the model fails but still merges safe anchors", () => {
    const prior: BusinessInfoRecord = {
      ...tempoBefore,
      known_for: "Existing reviewed fact.",
      source: {
        url: "https://www.tempodipasta.com/",
        fetchedAt: "2026-07-01T12:00:00.000Z",
      },
    };
    const next = mergeBusinessInfoCommerceEvidence(prior, {
      name: "Tempo Di Pasta",
      commerceLinks: [],
    });

    expect(next.known_for).toBe("Existing reviewed fact.");
    expect(next.source).toEqual(prior.source);
    expect(next.commerce_source).toEqual(prior.commerce_source);
    expect(next.commerce_links).toHaveLength(3);
  });
});
