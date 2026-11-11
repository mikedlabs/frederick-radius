/**
 * The place page's phone action bar ends on one cell after Directions and
 * Call: the commerce action (order or reserve) when the place has one, else
 * Website when the place has a website and no email. These two rules decide
 * whether the official website is reachable from the bar, and so whether a
 * place with no hours to show needs its own plain link to the website.
 */
type PhoneBarPlace = { website?: string | null; email?: string | null };

/** The phone bar's last cell is Website. */
export function phoneBarHasWebsite(place: PhoneBarPlace, hasCommerceCell: boolean): boolean {
  return !hasCommerceCell && Boolean(place.website) && !place.email;
}

/**
 * A place with no hours to show still needs a way to the official website
 * on a phone. When the bar has no Website cell, the page prints a plain link.
 */
export function needsWebsiteHoursLink(place: PhoneBarPlace, hasCommerceCell: boolean): boolean {
  return Boolean(place.website) && !phoneBarHasWebsite(place, hasCommerceCell);
}
