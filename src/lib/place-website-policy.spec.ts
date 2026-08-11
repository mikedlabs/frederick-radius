import { describe, expect, it } from "vitest";
import {
  isKnownThirdPartyPlaceWebsite,
  publishablePlaceWebsite,
} from "@/lib/place-website-policy";

describe("place website policy", () => {
  it("keeps safe first-party HTTP(S) websites", () => {
    expect(
      publishablePlaceWebsite("https://www.cafe-nola.com/menu"),
    ).toBe("https://www.cafe-nola.com/menu");
    expect(publishablePlaceWebsite("http://example.test/about")).toBe(
      "http://example.test/about",
    );
  });

  it.each([
    "https://starbucks-5719.wheree.com/",
    "https://rose-nails-spa-frederick.caweb.io/",
    "https://localbeautysalons.net/explore/rose-nails-spa-frederick/",
    "https://local.yahoo.com/info/example",
    "https://web.frederickchamber.org/Restaurants/example",
    "https://www.doordash.com/store/example",
    "https://www.visitfrederick.org/listing/example/",
  ])("withholds a known third-party listing: %s", (url) => {
    expect(isKnownThirdPartyPlaceWebsite(url)).toBe(true);
    expect(publishablePlaceWebsite(url)).toBeUndefined();
  });

  it("matches real subdomains without blocking lookalike hosts", () => {
    expect(isKnownThirdPartyPlaceWebsite("https://place.wheree.com/")).toBe(
      true,
    );
    expect(
      isKnownThirdPartyPlaceWebsite("https://notwheree.com/wheree.com"),
    ).toBe(false);
    expect(publishablePlaceWebsite("https://notwheree.com/wheree.com")).toBe(
      "https://notwheree.com/wheree.com",
    );
  });

  it("keeps owner-managed pages while still rejecting Google Maps listings", () => {
    expect(
      publishablePlaceWebsite("https://www.facebook.com/5westnewmarketmd/"),
    ).toBe("https://www.facebook.com/5westnewmarketmd/");
    expect(
      publishablePlaceWebsite("https://sites.google.com/view/newwinhing"),
    ).toBe("https://sites.google.com/view/newwinhing");
    expect(
      publishablePlaceWebsite(
        "https://www.fresha.com/lvp/savoir-salon-frederick",
      ),
    ).toBe("https://www.fresha.com/lvp/savoir-salon-frederick");
    expect(
      publishablePlaceWebsite("https://order.toasttab.com/online/example"),
    ).toBe("https://order.toasttab.com/online/example");
    expect(
      publishablePlaceWebsite("https://www.google.com/maps/place/example"),
    ).toBeUndefined();
  });

  it("keeps an explicitly reviewed publisher's own site without trusting its listings", () => {
    expect(
      publishablePlaceWebsite(
        "https://www.visitfrederick.org/",
        "Visit Frederick",
      ),
    ).toBe("https://www.visitfrederick.org/");
    expect(
      publishablePlaceWebsite(
        "https://www.visitfrederick.org/listing/example/",
        "Example Restaurant",
      ),
    ).toBeUndefined();
  });

  it.each([
    "http://www.friederdental.com/",
    "https://www.digdzsolutions.com/",
    "http://voilaspecialteas.com/",
    "http://www.givigahairsalon.com/",
  ])("withholds a rechecked but unusable first-party destination: %s", (url) => {
    expect(publishablePlaceWebsite(url)).toBeUndefined();
  });

  it.each([
    "javascript:alert(1)",
    "ftp://example.com/file",
    "https://user:secret@example.com/",
    "not a URL",
    "",
  ])("withholds an unsafe or malformed destination: %s", (url) => {
    expect(publishablePlaceWebsite(url)).toBeUndefined();
  });
});
