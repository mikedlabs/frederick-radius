import { describe, expect, it } from "vitest";
import {
  isTrustedBusinessWebsiteRedirect,
  needsRenderedBusinessSnapshot,
  preferredBusinessWebsiteUrls,
} from "../scripts/lib/business-info-source";
import {
  businessInfoSourceKind,
  isBusinessOwnedWebsite,
  isKnownThirdPartyBusinessSource,
} from "../scripts/lib/business-info-source-policy";

describe("business-info source trust", () => {
  it("prefers HTTPS while retaining a legacy HTTP fallback", () => {
    expect(
      preferredBusinessWebsiteUrls("http://www.example.com/menu"),
    ).toEqual([
      "https://www.example.com/menu",
      "http://www.example.com/menu",
    ]);
    expect(
      preferredBusinessWebsiteUrls("https://example.com/menu"),
    ).toEqual(["https://example.com/menu"]);
    expect(preferredBusinessWebsiteUrls("ftp://example.com/menu")).toEqual([]);
    expect(preferredBusinessWebsiteUrls("not a URL")).toEqual([]);
  });

  it("allows protocol, www, and same-site subdomain redirects", () => {
    expect(
      isTrustedBusinessWebsiteRedirect(
        "http://example.com",
        "https://www.example.com/menu",
      ),
    ).toBe(true);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://www.example.com",
        "https://order.example.com/start",
      ),
    ).toBe(true);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://events.example.com/calendar",
      ),
    ).toBe(true);
  });

  it("rejects unrelated and deceptively similar redirect hosts", () => {
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://unrelated.example/menu",
      ),
    ).toBe(false);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://example.com.evil.test/menu",
      ),
    ).toBe(false);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://example-menu.com",
      ),
    ).toBe(false);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://com",
      ),
    ).toBe(false);
  });

  it("renders only missing or text-thin snapshots", () => {
    const textRichWithoutCommerce = {
      text: "x".repeat(800),
      links: [],
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
    };
    expect(
      needsRenderedBusinessSnapshot(textRichWithoutCommerce, 500),
    ).toBe(false);
    expect(
      needsRenderedBusinessSnapshot(
        { ...textRichWithoutCommerce, text: "short" },
        500,
      ),
    ).toBe(true);
    expect(needsRenderedBusinessSnapshot(null, 500)).toBe(true);
  });

  it("does not mistake directories for a business's own website", () => {
    expect(
      isKnownThirdPartyBusinessSource(
        "https://www.bringfido.com/attraction/12519",
      ),
    ).toBe(true);
    expect(
      businessInfoSourceKind(
        "https://www.bringfido.com/attraction/12519",
      ),
    ).toBeNull();
    expect(
      businessInfoSourceKind(
        "https://www.songkick.com/venues/121916-baker-park-bandshell",
      ),
    ).toBeNull();
    for (const url of [
      "https://www.allmenus.com/md/frederick/restaurant/menu/",
      "https://www.restaurantguru.com/example-frederick",
      "https://www.yellowpages.com/frederick-md/example",
      "https://www.facebook.com/examplefrederick",
      "https://linktr.ee/examplefrederick",
      "https://maps.google.com/?q=example",
    ]) {
      expect(businessInfoSourceKind(url)).toBeNull();
    }
    for (const [url, name] of [
      [
        "https://local.yahoo.com/info-12634973-cruise-holidays-of-frederick-frederick/",
        "Cruise Holidays",
      ],
      [
        "https://web.frederickchamber.org/Salons-and-Spas/Six-East-SalonSpa-3068",
        "Six East Salon and Spa",
      ],
      [
        "https://health.usnews.com/doctors/vikram-sodhi-715646",
        "Dr Vikram Sodhi",
      ],
      [
        "https://www.touristplaces.info/frederick-md/staley-park/",
        "Staley Park",
      ],
      ["http://www.friederdental.com/", "Adam J Frieder DDS"],
    ]) {
      expect(businessInfoSourceKind(url, name)).toBeNull();
    }
  });

  it("requires a positive business-name binding on a dedicated host", () => {
    expect(
      businessInfoSourceKind(
        "https://locations.panerabread.com/md/frederick",
        "Panera Bread",
      ),
    ).toBe("business_website");
    expect(
      businessInfoSourceKind(
        "https://creameryathappycow.wixsite.com/happycowcreamerygran",
        "Happy Cow Creamery",
      ),
    ).toBe("business_website");
    expect(
      businessInfoSourceKind(
        "https://profiles.example-directory.test/business/acme-outfitters",
        "Acme Outfitters",
      ),
    ).toBeNull();
    expect(
      businessInfoSourceKind(
        "https://acme-outfitters.example-directory.test/profile",
        "Acme Outfitters",
      ),
    ).toBeNull();
    expect(businessInfoSourceKind("https://example.com/about")).toBeNull();
    expect(
      isBusinessOwnedWebsite(
        "https://acmeoutfitters.com/about",
        "Acme Outfitters",
      ),
    ).toBe(true);
  });

  it("keeps the Chamber's own site while rejecting its member directory", () => {
    expect(
      businessInfoSourceKind(
        "https://www.frederickchamber.org/",
        "Frederick County Chamber of Commerce",
      ),
    ).toBe("business_website");
    expect(
      businessInfoSourceKind(
        "https://web.frederickchamber.org/Salons-and-Spas/Six-East-SalonSpa-3068",
        "Six East Salon and Spa",
      ),
    ).toBeNull();
  });

  it("keeps narrow reviewed bindings for valid legacy business domains", () => {
    expect(
      businessInfoSourceKind(
        "https://fredcoffeeco.com/",
        "Frederick Coffee Co & Cafe",
      ),
    ).toBe("business_website");
    expect(
      businessInfoSourceKind(
        "https://uponmarket301.com/",
        "Up on Market Bistro & Inn",
      ),
    ).toBe("business_website");
    expect(
      businessInfoSourceKind(
        "https://fredcoffeeco.com/",
        "Different Coffee Shop",
      ),
    ).toBeNull();
  });

  it("labels agency-operated place pages as official sources without a business-name guess", () => {
    expect(
      businessInfoSourceKind("https://www.recreater.com/192/Dog-Parks"),
    ).toBe("official_source");
    expect(
      businessInfoSourceKind("https://www.fcpl.org/branches-hours/brunswick"),
    ).toBe("official_source");
    expect(
      businessInfoSourceKind("https://www.townofnewmarket.org/parks"),
    ).toBe("official_source");
  });
});
