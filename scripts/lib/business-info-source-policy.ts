export type BusinessInfoSourceKind =
  | "business_website"
  | "official_source";

/**
 * Listing, ticketing, and discovery sites are evidence about a business, not
 * the business's own publication. They must never inherit first-party trust
 * merely because a place record stored one of their URLs as `website`.
 */
const THIRD_PARTY_SOURCE_HOSTS = [
  "allmenus.com",
  "airbnb.com",
  "atlasobscura.com",
  "birdeye.com",
  "booksy.com",
  "bringfido.com",
  "businessyab.com",
  "chamberofcommerce.com",
  "classpass.com",
  "doordash.com",
  "eventbrite.com",
  "facebook.com",
  "findlocaltanning.com",
  "findmenuworld.com",
  "foursquare.com",
  "web.frederickchamber.org",
  "fresha.com",
  "google.com",
  "grubhub.com",
  "goto-where.com",
  "homelessshelterdirectory.org",
  "instagram.com",
  "linktr.ee",
  "loc8nearme.com",
  "mapquest.com",
  "marylandroadtrips.com",
  "massagebook.com",
  "menu-world.com",
  "menupix.com",
  "menus.fyi",
  "opentable.com",
  "postofficehours.us",
  "princetonreview.com",
  "restaurantguru.com",
  "restaurantji.com",
  "rehabs.com",
  "resy.com",
  "roadsideamerica.com",
  "sirved.com",
  "songkick.com",
  "toasttab.com",
  "touristplaces.info",
  "tripadvisor.com",
  "twitter.com",
  "ubereats.com",
  "untappd.com",
  "usarestaurants.info",
  "usnews.com",
  "visitfrederick.org",
  "wheree.com",
  "x.com",
  "yahoo.com",
  "yellowpages.com",
  "yelp.com",
] as const;

/** Government and agency-operated hosts that may support civic place facts. */
const OFFICIAL_SOURCE_HOSTS = [
  "recreater.com",
  "cityoffrederickmd.gov",
  "cityoffrederick.com",
  "fcpl.org",
  "fcps.org",
  "frederickcountymd.gov",
  "maryland.gov",
  "middletown.md.us",
  "myersville.org",
  "nps.gov",
  "thurmont.com",
  "townofnewmarket.org",
] as const;

/**
 * Multi-tenant products that actually host a business's own site. For these
 * providers the tenant label, not the provider's registrable domain, must bind
 * to the business name. Booking profiles, directories, social networks, and
 * marketplaces deliberately do not belong here.
 */
const REVIEWED_SITE_HOSTS = [
  "godaddysites.com",
  "shoplightspeed.com",
  "square.site",
  "squarespace.com",
  "weebly.com",
  "wixsite.com",
  "wordpress.com",
] as const;

/**
 * A few long-running Frederick businesses use a domain whose historical brand
 * is not recoverable from the current display name. Keep these narrow bindings
 * explicit and reviewable; never add a directory or a whole provider here.
 */
const REVIEWED_BUSINESS_HOST_BINDINGS: Readonly<
  Record<string, readonly string[]>
> = {
  "baltcoffee.com": ["baltimore coffee and tea co inc"],
  "bjsrestaurants.com": ["bjs restaurant brewhouse"],
  "cafe-nola.com": ["cafe nola"],
  "fredcoffeeco.com": [
    "frederick coffee co cafe",
    "frederick coffee company",
  ],
  "eatatwags.com": ["wags restaurant"],
  "junobakery.com": ["juno bakery"],
  "mythaifrederick.com": ["my thai"],
  "pistarro.com": ["pistarros"],
  "uponmarket301.com": [
    "up on market",
    "up on market bistro inn",
  ],
};

const BUSINESS_NAME_STOP_WORDS = new Set([
  "and",
  "bar",
  "barbecue",
  "bakery",
  "bbq",
  "bistro",
  "brewery",
  "brewing",
  "brewhouse",
  "cafe",
  "center",
  "centre",
  "co",
  "coffee",
  "company",
  "county",
  "downtown",
  "food",
  "foods",
  "for",
  "frederick",
  "grill",
  "group",
  "inc",
  "inn",
  "llc",
  "location",
  "market",
  "maryland",
  "restaurant",
  "restaurants",
  "pub",
  "service",
  "services",
  "shop",
  "spa",
  "store",
  "studio",
  "tapas",
  "taproom",
  "tavern",
  "taverna",
  "the",
  "winecellars",
  "winery",
]);

const HOST_IDENTITY_AFFIXES = [
  "frederick",
  "maryland",
  "restaurant",
  "restaurants",
  "barbecue",
  "brewing",
  "brewery",
  "winecellars",
  "creamery",
  "bakery",
  "taverna",
  "tavern",
  "taproom",
  "market",
  "coffee",
  "wines",
  "cafe",
  "grill",
  "bistro",
  "store",
  "shop",
  "brew",
  "pub",
  "bbq",
  "inn",
] as const;

function normalizedHostname(rawUrl: string): string | null {
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

function matchesHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizedWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function reviewedBindingName(value: string): string {
  return normalizedWords(value)
    .filter((word) => word !== "and" && word !== "the")
    .join(" ");
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stripHostIdentityAffixes(value: string): string {
  let result = value;
  let changed = true;
  while (changed && result) {
    changed = false;
    for (const affix of HOST_IDENTITY_AFFIXES) {
      if (result.length > affix.length && result.startsWith(affix)) {
        result = result.slice(affix.length);
        changed = true;
      }
      if (result.length > affix.length && result.endsWith(affix)) {
        result = result.slice(0, -affix.length);
        changed = true;
      }
    }
  }
  return result || value;
}

function registrableOwnerLabel(host: string): string | null {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  return labels.at(-2) ?? null;
}

function hostedTenantLabel(host: string): string | null {
  const provider = REVIEWED_SITE_HOSTS.find((domain) => matchesHost(host, domain));
  if (!provider || host === provider) return null;
  const prefix = host.slice(0, -(provider.length + 1));
  return prefix.split(".").filter(Boolean).at(-1) ?? null;
}

function matchesReviewedBinding(host: string, businessName: string): boolean {
  const names = REVIEWED_BUSINESS_HOST_BINDINGS[host];
  if (!names) return false;
  const subject = reviewedBindingName(businessName);
  return names.some((name) => reviewedBindingName(name) === subject);
}

/**
 * Positive host-to-business identity check.
 *
 * A URL being absent from a directory denylist is not ownership evidence. For
 * a dedicated domain, its owner label must carry the business's distinctive
 * name. For a reviewed site builder, the tenant subdomain must carry it. This
 * intentionally withholds ambiguous provider profiles for later review.
 */
export function isBusinessOwnedWebsite(
  rawUrl: string,
  businessName: string,
): boolean {
  const host = normalizedHostname(rawUrl);
  const subject = businessName.trim();
  if (!host || !subject || isKnownThirdPartyBusinessSource(rawUrl)) return false;
  if (
    host.endsWith(".gov") ||
    OFFICIAL_SOURCE_HOSTS.some((domain) => matchesHost(host, domain))
  ) {
    return false;
  }
  if (matchesReviewedBinding(host, subject)) return true;

  const identityLabel = hostedTenantLabel(host) ?? registrableOwnerLabel(host);
  if (!identityLabel) return false;
  const identity = compact(identityLabel);
  if (!identity) return false;
  const identityCore = stripHostIdentityAffixes(identity);

  const distinctive = normalizedWords(subject).filter(
    (word) => word.length >= 3 && !BUSINESS_NAME_STOP_WORDS.has(word),
  );
  if (distinctive.length === 0) return false;

  const joinedDistinctive = distinctive.join("");
  if (
    joinedDistinctive.length >= 5 &&
    (identity.includes(joinedDistinctive) ||
      identityCore.includes(joinedDistinctive))
  ) {
    return true;
  }

  const matches = distinctive.filter(
    (word) =>
      word.length >= 3 &&
      (identity.includes(word) || identityCore.includes(word)),
  );
  if (
    matches.length >= 2 &&
    matches.reduce((length, word) => length + word.length, 0) >= 7
  ) {
    return true;
  }
  if (matches.length === 1 && matches[0].length >= 5) {
    const word = matches[0];
    const strongEdgeMatch =
      identityCore === word ||
      identityCore.startsWith(word) ||
      identityCore.endsWith(word);
    if (
      strongEdgeMatch &&
      word.length / Math.max(identityCore.length, 1) >= 0.5
    ) {
      return true;
    }
  }

  // Initialisms are common local identities (BJ's, FCAC, WSRR). Require at
  // least three letters so a generic two-letter coincidence cannot bind a host.
  const initials = distinctive.map((word) => word[0]).join("");
  return (
    initials.length >= 3 &&
    (identity.includes(initials) || identityCore.includes(initials))
  );
}

export function isKnownThirdPartyBusinessSource(rawUrl: string): boolean {
  const host = normalizedHostname(rawUrl);
  return Boolean(
    host &&
      THIRD_PARTY_SOURCE_HOSTS.some((domain) => matchesHost(host, domain)),
  );
}

/**
 * Return the provenance label Radius may honestly attach to this source, or
 * null when the URL is a directory/discovery page rather than an eligible
 * first-party or official source.
 */
export function businessInfoSourceKind(
  rawUrl: string,
  businessName?: string,
): BusinessInfoSourceKind | null {
  const host = normalizedHostname(rawUrl);
  if (!host || isKnownThirdPartyBusinessSource(rawUrl)) return null;
  if (
    host.endsWith(".gov") ||
    OFFICIAL_SOURCE_HOSTS.some((domain) => matchesHost(host, domain))
  ) {
    return "official_source";
  }
  return businessName && isBusinessOwnedWebsite(rawUrl, businessName)
    ? "business_website"
    : null;
}
