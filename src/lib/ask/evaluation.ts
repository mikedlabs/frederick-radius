import type { AskIntentKind } from "@/lib/ask/intent";

export type AskEvalCase = {
  name: string;
  query: string;
  intent: AskIntentKind;
  requirePlace?: boolean;
  requireEvent?: boolean;
  maxLeadDistanceM?: number;
  forbidLead?: RegExp;
  allowedPlaceCategories?: string[];
};

/** Product questions, not model trivia. This set protects the exact failure
 * modes beta feedback exposed: wrong town, chains outranking downtown, missing
 * compound food intent, weather-aware plans, and event/place confusion. */
export const ASK_EVAL_CASES: AskEvalCase[] = [
  { name: "downtown breakfast sandwich", query: "good breakfast sandwich near me", intent: "place", requirePlace: true, maxLeadDistanceM: 4_000, forbidLead: /dunkin/i },
  { name: "downtown breakfast", query: "breakfast downtown", intent: "place", requirePlace: true, maxLeadDistanceM: 2_500 },
  { name: "coffee nearby", query: "independent coffee near me", intent: "place", requirePlace: true, maxLeadDistanceM: 4_000, forbidLead: /starbucks|dunkin/i },
  { name: "restaurant open", query: "restaurants open now near me", intent: "place", requirePlace: true, maxLeadDistanceM: 5_000 },
  { name: "pizza downtown", query: "pizza downtown Frederick", intent: "place", requirePlace: true, maxLeadDistanceM: 2_500 },
  { name: "brewery", query: "local brewery near me", intent: "place", requirePlace: true, maxLeadDistanceM: 6_000 },
  { name: "groceries", query: "grocery store near me", intent: "place", requirePlace: true, maxLeadDistanceM: 8_000 },
  { name: "hotel", query: "I need a hotel near downtown", intent: "place", requirePlace: true, maxLeadDistanceM: 6_000 },
  { name: "rainy family", query: "something indoors with kids because it is raining", intent: "explore", requirePlace: true },
  { name: "date night plan", query: "plan a walkable 3 hour date night", intent: "plan" },
  { name: "visitor evening", query: "plan dinner and something interesting for visiting parents", intent: "plan" },
  { name: "weather plan", query: "plan an afternoon before the rain", intent: "plan" },
  { name: "budget plan", query: "plan a cheap afternoon under $40", intent: "plan" },
  { name: "accessible plan", query: "plan an evening with easy parking and less walking", intent: "plan" },
  { name: "live music", query: "live music tonight", intent: "event", requireEvent: true },
  { name: "events tonight", query: "what events are happening tonight", intent: "event", requireEvent: true },
  { name: "weekend events", query: "events this weekend", intent: "event", requireEvent: true },
  { name: "free events", query: "free events this weekend", intent: "event", requireEvent: true },
  { name: "report pothole", query: "how do I report a pothole", intent: "civic" },
  { name: "animal control", query: "phone number for animal control", intent: "civic" },
  { name: "permit", query: "where do I get a county permit", intent: "civic" },
  { name: "north west dining", query: "I've eaten downtown and central Frederick. What are some good spots in northern or western Frederick County?", intent: "place" },
  { name: "quiet patio", query: "quiet patio where I can read", intent: "place", requirePlace: true },
  { name: "visitor discovery", query: "show a visitor something that feels like Frederick", intent: "explore", requirePlace: true },
  { name: "surprise", query: "surprise me with somewhere local", intent: "explore", requirePlace: true },
  {
    name: "steak reservation handoff",
    query: "I want a steak dinner tonight—use OpenTable for a 7:30 reservation",
    intent: "place",
    requirePlace: true,
    allowedPlaceCategories: ["restaurant"],
  },
];
