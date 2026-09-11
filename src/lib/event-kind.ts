/**
 * "Draw" vs "utility" for a single event — the one rule the whole app
 * shares so Today, /events, and /map agree on what leads and what gets
 * tucked into a quiet tail.
 *
 * Two layers, because feed categorization is uneven:
 *   1. Taxonomy — categoryKind() resolves the event's category (civic /
 *      government / public-safety / voting → "utility").
 *   2. Keyword net — catches genuinely-civic business that arrives with a
 *      blank or wrong category (e.g. a "review board" tagged "community"),
 *      which is exactly the leak that made the events list feel like a
 *      mess. Patterns are tight, meeting-specific phrases so real
 *      community events (ceremonies, festivals, fundraisers) stay draws.
 */
import { categoryKind } from "@/data/categories";

const UTILITY_TITLE_PATTERNS = [
  "city council",
  "county council",
  "town council",
  "council meeting",
  "commission meeting",
  "planning commission",
  "public hearing",
  "town hall meeting",
  "work session",
  "review board",
  "advisory board",
  "advisory council",
  "board of aldermen",
  "board of education",
  "board meeting",
  "budget hearing",
  "zoning",
  "regular meeting",
  "public meeting",
];

export function isUtilityEvent(e: { category?: string; title?: string }): boolean {
  if (categoryKind(e.category) === "utility") return true;
  const t = (e.title ?? "").toLowerCase();
  return UTILITY_TITLE_PATTERNS.some((p) => t.includes(p));
}
