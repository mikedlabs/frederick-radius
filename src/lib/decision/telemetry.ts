import { track } from "@/lib/track";

/**
 * One measurement vocabulary for the local-decision loop.
 *
 * Existing surface events (ask_answer, map_pin, save_place, and so on) remain
 * intact. These events add the small cross-surface spine needed to answer a
 * different question: did a recommendation become a useful next move?
 *
 * The contract is intentionally categorical. It accepts public entity slugs
 * and fixed enums only; it never accepts a search query, answer, coordinates,
 * URL, business name, or other free text.
 */
export const DECISION_SURFACES = [
  "today",
  "ask",
  "map",
  "events",
  "place",
  "saved",
  "compass",
  "search",
] as const;

export const DECISION_ENTITY_KINDS = [
  "place",
  "event",
  "answer",
  "tool",
  "amenity",
  "route",
  "source",
] as const;

export const DECISION_POSITIONS = [
  "lead",
  "alternative",
  "result",
  "detail",
  "sheet",
  "action_bar",
] as const;

export const DECISION_ACTIONS = [
  "open",
  "directions",
  "call",
  "email",
  "website",
  "menu",
  "order",
  "parking",
  "reservation",
  "ticket",
  "save",
  "share",
  "helpful",
  "not_relevant",
  "wrong",
] as const;

export const DECISION_STAGES = [
  "impression",
  "open",
  "action",
  "feedback",
] as const;

export type DecisionSurface = (typeof DECISION_SURFACES)[number];
export type DecisionEntityKind = (typeof DECISION_ENTITY_KINDS)[number];
export type DecisionPosition = (typeof DECISION_POSITIONS)[number];
export type DecisionAction = (typeof DECISION_ACTIONS)[number];
export type DecisionStage = (typeof DECISION_STAGES)[number];

/**
 * The anonymous daily counter deliberately has no entity id. `none` is an
 * explicit categorical value so the database key never needs a nullable
 * dimension for impressions.
 */
export type DecisionAggregateAction = DecisionAction | "none";

export type DecisionAggregateDimensions = {
  surface: DecisionSurface;
  stage: DecisionStage;
  entityKind: DecisionEntityKind;
  position: DecisionPosition;
  action: DecisionAggregateAction;
};

export type DecisionTelemetry = {
  stage: DecisionStage;
  surface: DecisionSurface;
  entityKind: DecisionEntityKind;
  /** A public Radius slug or a fixed non-user value such as "ask-answer". */
  entityId: string;
  position: DecisionPosition;
  action?: DecisionAction;
};

type DecisionProps = Record<string, string | number | boolean>;

const SURFACES = new Set<string>(DECISION_SURFACES);
const ENTITY_KINDS = new Set<string>(DECISION_ENTITY_KINDS);
const POSITIONS = new Set<string>(DECISION_POSITIONS);
const ACTIONS = new Set<string>(DECISION_ACTIONS);
const SAFE_PUBLIC_ID = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;
const DECISION_EVENT_NAMES = new Set([
  "decision_impression",
  "decision_open",
  "decision_action",
  "decision_helpful",
  "decision_not_relevant",
  "decision_wrong",
]);
const FEEDBACK_ACTIONS = new Set<DecisionAction>([
  "helpful",
  "not_relevant",
  "wrong",
]);
const DECISION_PROP_KEYS = new Set([
  "surface",
  "entity_kind",
  "entity_id",
  "position",
  "action",
]);

function hasValidStageAction(
  stage: DecisionStage,
  action?: DecisionAction,
): boolean {
  if (stage === "impression") return action === undefined;
  if (stage === "open") return action === "open";
  if (stage === "feedback") return Boolean(action && FEEDBACK_ACTIONS.has(action));
  return Boolean(action && action !== "open" && !FEEDBACK_ACTIONS.has(action));
}

export function decisionEventName(
  stage: DecisionStage,
  action?: DecisionAction,
): string {
  // Plausible Starter cannot segment custom properties. Keep the three
  // explicit judgments as separate, stable goals so public helpfulness can be
  // calculated without exposing the underlying question or answer.
  if (
    stage === "feedback" &&
    (action === "helpful" || action === "not_relevant" || action === "wrong")
  ) {
    return `decision_${action}`;
  }
  return `decision_${stage}`;
}

/**
 * Reject instead of "cleaning" unknown values. Silently reshaping arbitrary
 * text into an identifier could turn a user query into linked analytics data.
 */
export function decisionTelemetryProps(
  input: DecisionTelemetry,
): DecisionProps | null {
  if (!SURFACES.has(input.surface)) return null;
  if (!ENTITY_KINDS.has(input.entityKind)) return null;
  if (!POSITIONS.has(input.position)) return null;
  if (!SAFE_PUBLIC_ID.test(input.entityId)) return null;
  if (input.action && !ACTIONS.has(input.action)) return null;
  if (!hasValidStageAction(input.stage, input.action)) return null;

  const props: DecisionProps = {
    surface: input.surface,
    entity_kind: input.entityKind,
    entity_id: input.entityId,
    position: input.position,
  };
  if (input.action) props.action = input.action;
  return props;
}

/**
 * Parse the public decision event into the ONLY dimensions allowed in the
 * anonymous daily aggregate. Unknown keys and invalid stage/action pairings
 * are rejected rather than coerced. The public entity id is validated because
 * existing clients send it for the member-linked log, then intentionally
 * omitted from the returned aggregate dimensions.
 */
export function parseDecisionAggregateEvent(
  event: string,
  input: unknown,
): DecisionAggregateDimensions | null {
  if (!DECISION_EVENT_NAMES.has(event)) return null;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;

  const props = input as Record<string, unknown>;
  if (Object.keys(props).some((key) => !DECISION_PROP_KEYS.has(key))) return null;

  const surface = props.surface;
  const entityKind = props.entity_kind;
  const entityId = props.entity_id;
  const position = props.position;
  const action = props.action;
  if (typeof surface !== "string" || !SURFACES.has(surface)) return null;
  if (typeof entityKind !== "string" || !ENTITY_KINDS.has(entityKind)) return null;
  if (typeof entityId !== "string" || !SAFE_PUBLIC_ID.test(entityId)) return null;
  if (typeof position !== "string" || !POSITIONS.has(position)) return null;
  if (action !== undefined && (typeof action !== "string" || !ACTIONS.has(action))) {
    return null;
  }

  let stage: DecisionStage;
  let aggregateAction: DecisionAggregateAction;
  if (event === "decision_impression") {
    if (action !== undefined) return null;
    stage = "impression";
    aggregateAction = "none";
  } else if (event === "decision_open") {
    if (action !== "open") return null;
    stage = "open";
    aggregateAction = "open";
  } else if (event === "decision_action") {
    if (
      typeof action !== "string" ||
      action === "open" ||
      FEEDBACK_ACTIONS.has(action as DecisionAction)
    ) {
      return null;
    }
    stage = "action";
    aggregateAction = action as DecisionAction;
  } else {
    const expectedAction = event.slice("decision_".length) as DecisionAction;
    if (!FEEDBACK_ACTIONS.has(expectedAction) || action !== expectedAction) return null;
    stage = "feedback";
    aggregateAction = expectedAction;
  }

  return {
    surface: surface as DecisionSurface,
    stage,
    entityKind: entityKind as DecisionEntityKind,
    position: position as DecisionPosition,
    action: aggregateAction,
  };
}

export function trackDecision(input: DecisionTelemetry): void {
  const props = decisionTelemetryProps(input);
  if (!props) return;
  track(decisionEventName(input.stage, input.action), props);
}

/** Fixed stage semantics keep every surface comparable. */
export function stageForDecisionAction(action: DecisionAction): DecisionStage {
  if (action === "open") return "open";
  if (action === "helpful" || action === "not_relevant" || action === "wrong") {
    return "feedback";
  }
  return "action";
}

export type DecisionDataset = Partial<{
  decisionSurface: string;
  decisionEntity: string;
  decisionId: string;
  decisionPosition: string;
  decisionAction: string;
}>;

/**
 * A card may itself be clickable, so its dataset can contain both the
 * impression marker's context and `decisionAction=open`. Visibility is still
 * an impression; the action is counted only by the delegated click handler.
 */
export function decisionImpressionFromDataset(
  data: DecisionDataset,
): DecisionTelemetry | null {
  return decisionTelemetryFromDatasets({
    decisionSurface: data.decisionSurface,
    decisionEntity: data.decisionEntity,
    decisionId: data.decisionId,
    decisionPosition: data.decisionPosition,
  });
}

/**
 * Pure parser used by the delegated DOM observer. Context may live on the
 * card while the action lives on a nested link or button.
 */
export function decisionTelemetryFromDatasets(
  actionData: DecisionDataset,
  contextData: DecisionDataset = actionData,
): DecisionTelemetry | null {
  const surface = (actionData.decisionSurface ?? contextData.decisionSurface) as DecisionSurface;
  const entityKind = (actionData.decisionEntity ?? contextData.decisionEntity) as DecisionEntityKind;
  const entityId = actionData.decisionId ?? contextData.decisionId ?? "";
  const position = (actionData.decisionPosition ?? contextData.decisionPosition) as DecisionPosition;
  const action = actionData.decisionAction as DecisionAction | undefined;
  const stage = action ? stageForDecisionAction(action) : "impression";
  const parsed: DecisionTelemetry = {
    stage,
    surface,
    entityKind,
    entityId,
    position,
    ...(action ? { action } : {}),
  };
  return decisionTelemetryProps(parsed) ? parsed : null;
}

/** Convert a canonical entity route to a public identifier without its query. */
export function decisionEntityFromPath(path: string | null): {
  entityKind: "place" | "event" | "answer";
  entityId: string;
} {
  const match = path?.match(/^\/(places|events)\/([a-z0-9][a-z0-9-]{0,127})(?:[?#]|$)/i);
  if (!match) return { entityKind: "answer", entityId: "ask-answer" };
  return {
    entityKind: match[1] === "places" ? "place" : "event",
    entityId: match[2],
  };
}

/** Coarse route context only. Query strings and hashes are never inspected. */
export function decisionContextFromPath(path: string): {
  surface: DecisionSurface;
  position: DecisionPosition;
} {
  if (path === "/today" || path.startsWith("/today/")) {
    return { surface: "today", position: "result" };
  }
  if (path === "/ask" || path.startsWith("/ask/")) {
    return { surface: "ask", position: "result" };
  }
  if (path === "/map" || path.startsWith("/map/")) {
    return { surface: "map", position: "result" };
  }
  if (path === "/events" || path.startsWith("/events/")) {
    return { surface: "events", position: "detail" };
  }
  if (path === "/places" || path.startsWith("/places/")) {
    return { surface: "place", position: "detail" };
  }
  if (path === "/saved" || path.startsWith("/saved/")) {
    return { surface: "saved", position: "result" };
  }
  if (path === "/compass" || path.startsWith("/compass/")) {
    return { surface: "compass", position: "result" };
  }
  return { surface: "search", position: "result" };
}
