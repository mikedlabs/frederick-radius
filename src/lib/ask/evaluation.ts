import type {
  AskAudience,
  AskIntentKind,
  AskTimeNeed,
} from "@/lib/ask/intent";
import type { LngLat } from "@/lib/geo";

export const ASK_EVAL_DIMENSIONS = [
  "town",
  "exact-location",
  "accessibility",
  "weather",
  "future-date",
] as const;

export type AskEvalDimension = (typeof ASK_EVAL_DIMENSIONS)[number];

export type AskEvalContext = {
  origin: LngLat;
  municipality?: string;
  contextLabel: string;
  /** False for a town centroid; true only for a deliberately exact fixture. */
  canShowDistance: boolean;
};

export type AskEvalCase = {
  name: string;
  query: string;
  intent: AskIntentKind;
  dimensions?: AskEvalDimension[];
  context?: AskEvalContext;
  requirePlace?: boolean;
  requireEvent?: boolean;
  /** An honest empty result is acceptable when no current schedule can prove
   * a place open. Any returned place must carry a real open state. */
  requireSafeOpenIfPresent?: boolean;
  maxLeadDistanceM?: number;
  forbidLead?: RegExp;
  allowedPlaceCategories?: string[];
  expectedLeadCategory?: string;
  expectedLeadMunicipality?: string;
  expectedLeadEventTitle?: string;
  expectedLeadEventDate?: string;
  expectedLeadEventMunicipality?: string;
  expectedContextLabel?: string;
  requireNearMeApplied?: boolean;
  expectedTimeNeed?: AskTimeNeed;
  expectedAudience?: AskAudience;
  expectedTravelMode?: "walk" | "drive" | null;
  expectedRequestedDate?: string;
  requireWeatherContext?: boolean;
  /** A weather-aware discovery request must still answer the activity need,
   * rather than being mistaken for a forecast-only question. */
  requireWeatherDiscovery?: boolean;
};

/** Product questions, not model trivia. This set protects the exact failure
 * modes beta feedback exposed: wrong town, chains outranking downtown, missing
 * compound food intent, weather-aware plans, and event/place confusion. */
export const ASK_EVAL_CASES: AskEvalCase[] = [
  { name: "downtown breakfast sandwich", query: "good breakfast sandwich near me", intent: "place", requirePlace: true, maxLeadDistanceM: 4_000, forbidLead: /dunkin/i },
  { name: "downtown breakfast", query: "breakfast downtown", intent: "place", requirePlace: true, maxLeadDistanceM: 2_500 },
  { name: "coffee nearby", query: "independent coffee near me", intent: "place", requirePlace: true, maxLeadDistanceM: 4_000, forbidLead: /starbucks|dunkin/i },
  { name: "restaurant open", query: "restaurants open now near me", intent: "place", requireSafeOpenIfPresent: true, maxLeadDistanceM: 5_000, allowedPlaceCategories: ["restaurant"] },
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
    query: "I want a steak dinner tonight, and use OpenTable for a 7:30 reservation",
    intent: "place",
    requirePlace: true,
    allowedPlaceCategories: ["restaurant"],
  },
  {
    name: "Brunswick coffee from a town anchor",
    query: "independent coffee near me",
    intent: "place",
    dimensions: ["town"],
    context: {
      origin: { lng: -77.6278, lat: 39.3143 },
      municipality: "brunswick",
      contextLabel: "Brunswick",
      canShowDistance: false,
    },
    requirePlace: true,
    maxLeadDistanceM: 5_000,
    forbidLead: /dunkin|starbucks/i,
    expectedLeadMunicipality: "brunswick",
    expectedContextLabel: "Brunswick",
    requireNearMeApplied: true,
  },
  {
    name: "Urbana weather and family intent parsing",
    query: "something indoors with kids in Urbana because storms are expected",
    intent: "explore",
    dimensions: ["town", "weather"],
    context: {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    },
    expectedAudience: "family",
    requireWeatherContext: true,
    requireWeatherDiscovery: true,
  },
  {
    name: "Urbana weather-aware gallery retrieval",
    query: "indoor gallery near me in Urbana because storms are expected",
    intent: "place",
    dimensions: ["town", "weather"],
    context: {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    },
    requirePlace: true,
    maxLeadDistanceM: 3_000,
    expectedLeadCategory: "gallery",
    expectedLeadMunicipality: "urbana",
    expectedContextLabel: "Urbana",
    requireNearMeApplied: true,
    requireWeatherContext: true,
    requireWeatherDiscovery: true,
  },
  {
    name: "coffee from the exact Carroll Creek position",
    query: "independent coffee near me",
    intent: "place",
    dimensions: ["exact-location"],
    context: {
      origin: { lng: -77.41015, lat: 39.41345 },
      contextLabel: "Carroll Creek Park",
      canShowDistance: true,
    },
    requirePlace: true,
    maxLeadDistanceM: 1_200,
    forbidLead: /dunkin|starbucks/i,
    expectedContextLabel: "Carroll Creek Park",
    requireNearMeApplied: true,
  },
  {
    name: "accessibility language plus museum retrieval",
    query: "wheelchair-friendly museum with easy parking",
    intent: "place",
    dimensions: ["accessibility", "exact-location"],
    context: {
      origin: { lng: -77.41015, lat: 39.41345 },
      contextLabel: "Carroll Creek Park",
      canShowDistance: true,
    },
    requirePlace: true,
    expectedLeadCategory: "museum",
    expectedTravelMode: "drive",
  },
  {
    name: "future Thurmont event retrieval",
    query: "what events are happening in Thurmont on October 10, 2026?",
    intent: "event",
    dimensions: ["town", "future-date"],
    context: {
      origin: { lng: -77.4108, lat: 39.6237 },
      municipality: "thurmont",
      contextLabel: "Thurmont",
      canShowDistance: false,
    },
    requireEvent: true,
    expectedRequestedDate: "2026-10-10",
    expectedLeadEventTitle: "Catoctin Colorfest",
    expectedLeadEventDate: "2026-10-10",
    expectedLeadEventMunicipality: "thurmont",
  },
  {
    name: "accessible future plan parsing from Middletown",
    query: "plan tomorrow afternoon with a wheelchair and easy parking in Middletown",
    intent: "plan",
    dimensions: ["town", "accessibility", "future-date"],
    context: {
      origin: { lng: -77.5447, lat: 39.4437 },
      municipality: "middletown",
      contextLabel: "Middletown",
      canShowDistance: false,
    },
    expectedTimeNeed: "tomorrow",
    expectedTravelMode: "drive",
    expectedRequestedDate: "2026-07-31",
  },
];
