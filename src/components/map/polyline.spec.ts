import { describe, expect, it } from "vitest";
import { encodePolyline } from "./polyline";

describe("encodePolyline", () => {
  it("encodes longitude-latitude route coordinates in standard polyline order", () => {
    expect(
      encodePolyline(
        [
          [-120.2, 38.5],
          [-120.95, 40.7],
          [-126.453, 43.252],
        ],
        5,
      ),
    ).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("requires a usable line", () => {
    expect(encodePolyline([])).toBeNull();
    expect(encodePolyline([[-77.41, 39.41]])).toBeNull();
  });
});
