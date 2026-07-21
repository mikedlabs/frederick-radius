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

export type DaypartNeed = {
  /** Human label for what people want ("Coffee", "Dinner"). */
  label: string;
  /** Catalog category slug to pull open-now places from. */
  category: string;
  /** Where "see all" links. */
  href: string;
};

/** Weather-leaned additions (see lib/today/weatherLean): on a wet day the
 *  shelf leads with indoor browsing; on a 92°+ day, with cool-down treats.
 *  Never duplicates a category the daypart already carries. */
const WET_NEEDS: DaypartNeed[] = [
  { label: "Museums & indoors", category: "museum", href: "/category/museum" },
  { label: "Bookstores & cozy corners", category: "book-store", href: "/category/book-store" },
];
const HOT_NEEDS: DaypartNeed[] = [
  { label: "Ice cream & cool treats", category: "ice-cream", href: "/category/ice-cream" },
];

export function daypartNeeds(
  easternHour: number,
  lean: "wet" | "hot" | null = null,
): DaypartNeed[] {
  const base = baseDaypartNeeds(easternHour);
  if (!lean) return base;
  const extras = (lean === "wet" ? WET_NEEDS : HOT_NEEDS).filter(
    (need) => !base.some((b) => b.category === need.category),
  );
  return [...extras, ...base];
}

function baseDaypartNeeds(easternHour: number): DaypartNeed[] {
  const h = ((easternHour % 24) + 24) % 24;
  // Morning 5–11: the first-cup + breakfast window.
  if (h >= 5 && h < 11) {
    return [
      { label: "Coffee", category: "coffee", href: "/category/coffee" },
      { label: "Breakfast & bakeries", category: "bakery", href: "/category/bakery" },
    ];
  }
  // Midday 11–16: lunch, with a coffee backstop.
  if (h >= 11 && h < 16) {
    return [
      { label: "Lunch", category: "restaurant", href: "/category/restaurant" },
      { label: "Coffee & cafes", category: "coffee", href: "/category/coffee" },
    ];
  }
  // Evening 16–21: dinner and drinks (matches the 17:00 evening gear closely
  // enough; dinner planning starts before 5).
  if (h >= 16 && h < 21) {
    return [
      { label: "Dinner", category: "restaurant", href: "/category/restaurant" },
      { label: "Breweries & taprooms", category: "brewery", href: "/beer" },
      { label: "Bars", category: "bar", href: "/category/bar" },
    ];
  }
  // Late 21–05: who's still serving.
  return [
    { label: "Bars open late", category: "bar", href: "/category/bar" },
    { label: "Still serving", category: "restaurant", href: "/category/restaurant" },
  ];
}
