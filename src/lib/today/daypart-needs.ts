/**
 * What most people want out and about, by daypart — the place-side companion
 * to the time-aware masthead. /today leaned event-heavy, so at 8 AM it never
 * put coffee in front of you and at 6 PM it never led with dinner (owner,
 * 2026-07-20: "should the today page list the most common things people would
 * want in the AM, midday, and evening... i dont see the list of places").
 *
 * Pure + unit-tested. The server component reads the current Eastern hour,
 * calls this, and fills each need with the top OPEN-NOW places of its
 * category. Boundaries match the masthead / evening gear (17:00 = evening).
 */

import { scopeToParam, type Scope } from "@/lib/scope";

export type DaypartNeed = {
  /** Human label for what people want ("Coffee", "Dinner"). */
  label: string;
  /** Catalog category slug to pull open-now places from. */
  category: string;
  /** Where "see all" links. */
  href: string;
};

/**
 * The availability-ordered "see all" destination for a daypart need. This
 * lives here, in the pure server-safe module, because the SERVER html must
 * already carry it: a heading that says "Places open now" cannot send a
 * pre-hydration tap (or the fallback after a failed live refresh) to a
 * popularity-sorted /category page that never orders by open status. The
 * client shelf refines the same href with the person's coarse browsing
 * scope; exact device coordinates stay in session storage and the URL
 * carries only the noun/facet and that scope.
 *
 * Breweries are the deliberate exception: /beer is its own product surface,
 * so the brewery row keeps it on the server and client paths alike instead
 * of letting /nearby?c=breweries silently replace it.
 */
export function daypartBrowseHref(
  category: string,
  label: string,
  scope: Scope | null = null,
): string | null {
  if (category === "brewery") return "/beer";
  const normalizedLabel = label.toLowerCase();
  const target =
    category === "coffee"
      ? { craving: "coffee" }
      : category === "bakery"
        ? { craving: "breakfast" }
        : category === "restaurant"
          ? {
              craving: normalizedLabel.includes("lunch")
                ? "lunch"
                : normalizedLabel.includes("dinner")
                  ? "dinner"
                  : normalizedLabel.includes("still")
                    ? "late"
                    : "food",
            }
          : category === "bar"
            ? { craving: "drinks", facet: "bar" }
            : category === "ice-cream"
              ? { craving: "ice-cream" }
              : category === "museum"
                ? { craving: "art", facet: "museum" }
                : category === "book-store"
                  ? { craving: "shops", facet: "book-store" }
                  : null;
  if (!target) return null;

  const params = new URLSearchParams({ c: target.craving });
  if ("facet" in target && target.facet) params.set("facet", target.facet);
  if (scope) params.set("in", scopeToParam(scope));
  return `/nearby?${params.toString()}`;
}

/** Every category below has a mapping, so the fallback is unreachable today;
 *  it exists so a future need added without one still links somewhere that
 *  honors the shelf's open-now claim. */
function need(label: string, category: string): DaypartNeed {
  return {
    label,
    category,
    href: daypartBrowseHref(category, label) ?? "/open-now",
  };
}

/** Weather-leaned additions (see lib/today/weatherLean): on a wet day the
 *  shelf leads with indoor browsing; on a 92°+ day, with cool-down treats.
 *  Never duplicates a category the daypart already carries. */
const WET_NEEDS: DaypartNeed[] = [
  need("Museums & indoors", "museum"),
  need("Bookstores & cozy corners", "book-store"),
];
const HOT_NEEDS: DaypartNeed[] = [need("Ice cream & cool treats", "ice-cream")];

export function daypartNeeds(
  easternHour: number,
  lean: "wet" | "hot" | null = null,
): DaypartNeed[] {
  const base = baseDaypartNeeds(easternHour);
  if (!lean) return base;
  const extras = (lean === "wet" ? WET_NEEDS : HOT_NEEDS).filter(
    (extra) => !base.some((b) => b.category === extra.category),
  );
  return [...extras, ...base];
}

function baseDaypartNeeds(easternHour: number): DaypartNeed[] {
  const h = ((easternHour % 24) + 24) % 24;
  // Morning 5–11: the first-cup + breakfast window.
  if (h >= 5 && h < 11) {
    return [need("Coffee", "coffee"), need("Breakfast & bakeries", "bakery")];
  }
  // Midday 11–16: lunch, with a coffee backstop.
  if (h >= 11 && h < 16) {
    return [need("Lunch", "restaurant"), need("Coffee & cafes", "coffee")];
  }
  // Evening 16–21: dinner and drinks (matches the 17:00 evening gear closely
  // enough; dinner planning starts before 5).
  if (h >= 16 && h < 21) {
    return [
      need("Dinner", "restaurant"),
      need("Breweries & taprooms", "brewery"),
      need("Bars", "bar"),
    ];
  }
  // Late 21–05: who's still serving.
  return [need("Bars open late", "bar"), need("Still serving", "restaurant")];
}
