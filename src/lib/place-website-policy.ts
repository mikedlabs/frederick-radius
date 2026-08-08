/**
 * Passive directories and scraped listing hosts are useful evidence, but they
 * are not a place's own web presence. Owner-managed social, booking, and hosted
 * pages remain useful for small businesses that have no separate domain.
 */
const THIRD_PARTY_PLACE_WEBSITE_HOSTS = [
  "allmenus.com",
  "atlasobscura.com",
  "birdeye.com",
  "bringfido.com",
  "businessyab.com",
  "chamberofcommerce.com",
  "caweb.io",
  "doordash.com",
  "eventbrite.com",
  "findlocaltanning.com",
  "findmenuworld.com",
  "foursquare.com",
  "web.frederickchamber.org",
  "grubhub.com",
  "goto-where.com",
  "homelessshelterdirectory.org",
  "loc8nearme.com",
  "localbeautysalons.net",
  "mapquest.com",
  "marylandroadtrips.com",
  "menu-world.com",
  "menupix.com",
  "menus.fyi",
  "postofficehours.us",
  "princetonreview.com",
  "restaurantguru.com",
  "restaurantji.com",
  "rehabs.com",
  "roadsideamerica.com",
  "sirved.com",
  "songkick.com",
  "touristplaces.info",
  "tripadvisor.com",
  "ubereats.com",
  "usarestaurants.info",
  "usnews.com",
  "visitfrederick.org",
  "wheree.com",
  "yahoo.com",
  "yellowpages.com",
  "yelp.com",
] as const;

/** Previously stored first-party domains that were rechecked on 2026-08-08
 * and did not lead to a working business site. Keep them out of public Website
 * actions until a later refresh finds a valid replacement. */
const KNOWN_UNUSABLE_PLACE_WEBSITE_HOSTS = [
  "digdzsolutions.com",
  "friederdental.com",
  "givigahairsalon.com",
  "voilaspecialteas.com",
] as const;

/** A directory can still be the first-party site of the organization that
 * operates it. Keep those rare identities explicit instead of allowing the
 * host for every listed place. */
const REVIEWED_HOST_OWNER_NAMES: Readonly<Record<string, readonly string[]>> = {
  "visitfrederick.org": ["visit frederick"],
};

function matchesHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function httpHostname(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isKnownThirdPartyHost(host: string): boolean {
  return Boolean(
    THIRD_PARTY_PLACE_WEBSITE_HOSTS.some((domain) =>
      matchesHost(host, domain),
    ),
  );
}

function isGoogleDirectoryUrl(rawUrl: string, host: string): boolean {
  if (!matchesHost(host, "google.com")) return false;
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    return host === "maps.google.com" || pathname.startsWith("/maps");
  } catch {
    return false;
  }
}

export function isKnownThirdPartyPlaceWebsite(rawUrl: string): boolean {
  const host = httpHostname(rawUrl);
  return Boolean(
    host &&
      (isKnownThirdPartyHost(host) || isGoogleDirectoryUrl(rawUrl, host)),
  );
}

/**
 * Return a place URL only when it is a safe HTTP(S) destination and does not
 * belong to a known third-party directory or marketplace.
 */
export function publishablePlaceWebsite(
  rawUrl: string | null | undefined,
  placeName?: string,
): string | undefined {
  const value = rawUrl?.trim();
  const host = value ? httpHostname(value) : null;
  if (!value || !host) {
    return undefined;
  }
  if (
    KNOWN_UNUSABLE_PLACE_WEBSITE_HOSTS.some((domain) =>
      matchesHost(host, domain),
    )
  ) {
    return undefined;
  }
  if (isKnownThirdPartyHost(host) || isGoogleDirectoryUrl(value, host)) {
    const normalizedName = placeName
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const isReviewedOwner = Object.entries(REVIEWED_HOST_OWNER_NAMES).some(
      ([domain, names]) =>
        matchesHost(host, domain) &&
        Boolean(normalizedName && names.includes(normalizedName)),
    );
    if (!isReviewedOwner) return undefined;
  }
  return value;
}
