/**
 * Time-of-day-aware suggestion chips for the search overlay.
 *
 * Returns 4–6 suggestions that fit the current hour in Eastern time:
 *   • 5am–10am   — coffee, bakery, breakfast, walking trail
 *   • 10am–4pm   — lunch, park, museum, kid-friendly
 *   • 4pm–7pm    — dinner, brewery, happy hour, live music
 *   • 7pm–1am    — dinner, live music, bar, late night
 *   • 1am–5am    — overnight (24hr places, hotels, gas)
 *
 * "Try" used to show a fixed 6-string list; this rotates it so a
 * morning visitor sees "coffee right now" and an evening visitor
 * sees "dinner near me" — feels like the modal knows what time it is.
 */

export function suggestionsForHour(hour: number): string[] {
  if (hour >= 5 && hour < 10) {
    return [
      "coffee right now",
      "breakfast",
      "bakery",
      "trail",
      "open now",
      "weekend market",
    ];
  }
  if (hour >= 10 && hour < 14) {
    return [
      "lunch",
      "coffee",
      "park",
      "museum",
      "kid-friendly",
      "free things",
    ];
  }
  if (hour >= 14 && hour < 17) {
    return [
      "ice cream",
      "park",
      "shopping",
      "live music",
      "free things",
      "kid-friendly",
    ];
  }
  if (hour >= 17 && hour < 19) {
    return [
      "dinner",
      "happy hour",
      "brewery",
      "live music",
      "wine",
      "carroll creek",
    ];
  }
  if (hour >= 19 && hour < 23) {
    return [
      "dinner",
      "live music",
      "bar",
      "wine",
      "open late",
      "tonight",
    ];
  }
  if (hour >= 23 || hour < 1) {
    return [
      "open late",
      "bar",
      "live music",
      "lodging",
      "diner",
      "tonight",
    ];
  }
  // 1am–5am — overnight
  return [
    "24 hour",
    "lodging",
    "gas",
    "diner",
    "open now",
    "trail",
  ];
}

/**
 * Convenience: the hour in America/New_York right now, since the app
 * is locked to Frederick County. Pure server/client compatible.
 */
export function frederickHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(h, 10);
}
