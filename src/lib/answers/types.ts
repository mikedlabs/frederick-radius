/**
 * Answer-first types, planned in the June 2026 UX redo (now
 * docs/archive/2026-06/UX_REDO.md) as the shared shape behind an AnswerCard
 * primitive and the /today front door. The AnswerCard section was later cut
 * from /today; QuickIntent and IntentIcon below still serve the quick-answer
 * intents and SearchOverlay. The source and freshness rules an answer must
 * meet live in docs/DATA_CONFIDENCE_GATE.md.
 *
 * A Frederick Radius "answer" is the North Star unit: it states the
 * answer, why it's shown, its source + freshness, and one or two
 * actions.
 */

/** Status chip kinds. Each maps to a tone in AnswerCard. */
export type AnswerStatus =
  | "open-now"
  | "tonight"
  | "weekend"
  | "transit"
  | "parking"
  | "civic"
  | "events"
  | "free";

export type AnswerAction = { label: string; href: string };

export type Answer = {
  /** Stable key for React + dedupe. */
  id: string;
  /** Optional status chip (Open now, Tonight, Parking…). */
  status?: AnswerStatus;
  /** Override the chip's default label. */
  statusLabel?: string;
  /** The headline answer, e.g. "Gravel & Grind is open until 9 PM". A
   *  count is supporting detail, never the headline. */
  title: string;
  /** The short supporting answer, e.g. "Closest is Gravel & Grind." */
  answer?: string;
  /** Why this is being shown, e.g. "Open this hour, within reach". */
  whyShown?: string;
  /** Provenance, e.g. "Google Places". Trust is the product. */
  sourceLabel?: string;
  /** Freshness, e.g. "checked today". */
  freshnessLabel?: string;
  /** Optional distance, e.g. "0.4 mi". */
  distanceLabel?: string;
  /** Optional time, e.g. "7:30 PM". */
  timeLabel?: string;
  primaryAction?: AnswerAction;
  secondaryAction?: AnswerAction;
};

/** Icon names for quick intents, kept as strings so the intent list
 *  stays server-safe (no JSX import). Client renderers map them back. */
export type IntentIcon = "clock" | "calendar" | "train" | "pin";

/**
 * A recognized need that resolves in one tap. Extracted from the old
 * SearchOverlay QUICK_INTENTS so search and Today share ONE source.
 */
export type QuickIntent = {
  key: string;
  /** Phrases that match this intent in free-text search. */
  terms: string[];
  /** The answer phrasing, e.g. "What's open right now". */
  title: string;
  /** One-line support, e.g. "Places confirmed open near you". */
  sub: string;
  /** Short label for the /today hero chip, e.g. "Open now". */
  chip: string;
  /** The destination that IS the answer. */
  href: string;
  icon: IntentIcon;
  /** Status chip kind when rendered as an AnswerCard. */
  status: AnswerStatus;
};
