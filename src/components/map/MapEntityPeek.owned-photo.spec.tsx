import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapAerialPeek } from "./MapEntityPeek";

describe("owned map aerial photograph", () => {
  it.each(["2023-06-05T00:17:21.000Z", null, "unreadable"])(
    "keeps the place and actions without visible capture date or credit (%s)",
    (takenAt) => {
      const html = renderToStaticMarkup(createElement(MapAerialPeek, {
        photo: { src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg", season: "summer", takenAt, lng: -77.401617, lat: 39.412551 },
        onClose: () => {},
      }));
      expect(html).toContain('alt="Frederick County from the air."');
      expect(html).toContain('aria-label="Aerial photograph"');
      expect(html).toContain("Frederick from this spot");
      expect(html).toContain("Directions");
      expect(html).toContain("39.412551");
      expect(html).toContain("-77.401617");
      expect(html).not.toContain("Capture date unavailable");
      expect(html).not.toContain("Radius photo archive");
      expect(html).not.toContain("2023");
    },
  );
});
