import type { QuickIntent } from "./types";
import { primaryAnswerFor } from "@/lib/search/answer";

/**
 * Quick-answer intents — recognized needs that resolve in ONE tap to
 * the right pre-filtered view, instead of making the user browse.
 * Phrased as the answer, not a search ("What's open right now"). North
 * Star: answer the question, ≤2 taps. Each entry's href IS the answer.
 *
 * Extracted from SearchOverlay so the overlay AND the /today AnswerCards
 * read from one source (UX_REDO Build 1). Icons are string names so this
 * stays server-safe; client renderers map them to glyphs.
 */
export const QUICK_INTENTS: QuickIntent[] = [
  {
    key: "open-now",
    terms: ["open now", "whats open", "what's open", "open right now", "open late", "anything open"],
    title: "What's open right now",
    sub: "Places with recently confirmed open hours",
    chip: "Open now",
    href: "/map?mode=browse&open=now",
    icon: "clock",
    status: "open-now",
  },
  {
    key: "tonight",
    terms: ["tonight", "this evening", "live music", "music tonight", "show tonight", "concert"],
    title: "Happening tonight",
    sub: "Events & music starting soon",
    chip: "Tonight",
    href: "/today?t=tonight",
    icon: "calendar",
    status: "tonight",
  },
  {
    key: "weekend",
    terms: ["weekend", "this weekend", "saturday", "sunday", "things to do"],
    title: "This weekend",
    sub: "Events across the county",
    chip: "This weekend",
    href: "/today?t=weekend",
    icon: "calendar",
    status: "weekend",
  },
  {
    key: "transit",
    terms: ["train", "marc", "transit", "commute", "bus", "next train"],
    title: "MARC & transit times",
    sub: "Next departures and routes",
    chip: "Transit",
    href: "/transit",
    icon: "train",
    status: "transit",
  },
  {
    key: "parking",
    terms: ["parking", "park the car", "garage", "where to park", "meter"],
    title: "Parking",
    sub: "Garages, lots & street parking",
    chip: "Parking",
    href: "/map?mode=browse&intent=parking",
    icon: "pin",
    status: "parking",
  },
  {
    key: "events",
    terms: ["event", "events", "happening", "calendar"],
    title: "Events",
    sub: "What's on across Frederick",
    chip: "Events",
    href: "/events",
    icon: "calendar",
    status: "events",
  },
];

/**
 * Match a free-text query to quick intents. Identical behavior to the
 * old SearchOverlay-local version (now the single source). Cheap,
 * synchronous, no fetch.
 */
export function findQuickAnswers(query: string, limit = 2): QuickIntent[] {
  const lq = query.toLowerCase().trim();
  if (lq.length < 3) return [];
  const out: QuickIntent[] = [];
  const seen = new Set<string>();

  // A craving query ("coffee open now near me", "where's a good beer") leads
  // with the nearest-open craving surface, the same answer /search shows. It's
  // synthesized from the ONE query->answer mapping (primaryAnswerFor) so search
  // and the overlay never drift. Bare "open now" stays owned by the intent
  // below, which routes to its established map-open view.
  const answer = primaryAnswerFor(query);
  if (answer && answer.key !== "open-now") {
    seen.add(answer.href);
    out.push({
      key: `craving:${answer.key}`,
      terms: [],
      title: answer.label,
      sub: answer.kicker,
      chip: answer.label,
      href: answer.href,
      icon: "pin",
      status: "open-now",
    });
  }

  for (const intent of QUICK_INTENTS) {
    if (intent.terms.some((t) => lq.includes(t)) && !seen.has(intent.href)) {
      seen.add(intent.href);
      out.push(intent);
    }
  }
  return out.slice(0, limit);
}
