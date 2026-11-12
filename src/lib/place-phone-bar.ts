/**
 * The place page's phone action bar ends on one cell after Directions and
 * Call: the commerce action (order or reserve) when the place has one, else
 * Website when the place has a website and no email. These two rules decide
 * whether the official website is reachable from the bar, and so whether the
 * page prints its own plain link to the website on a phone.
 */
type PhoneBarPlace = { website?: string | null; email?: string | null };

/** The phone bar's last cell is Website. */
export function phoneBarHasWebsite(place: PhoneBarPlace, hasCommerceCell: boolean): boolean {
  return !hasCommerceCell && Boolean(place.website) && !place.email;
}

/**
 * A place with a website keeps a way to it on a phone, with or without a
 * posted schedule. When the bar has no Website cell, the page prints a plain
 * link.
 */
export function needsWebsiteLink(place: PhoneBarPlace, hasCommerceCell: boolean): boolean {
  return Boolean(place.website) && !phoneBarHasWebsite(place, hasCommerceCell);
}
