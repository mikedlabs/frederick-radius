import { describe, expect, it } from "vitest";
import {
  decisionEntityFromPath,
  decisionContextFromPath,
  decisionEventName,
  decisionImpressionFromDataset,
  decisionTelemetryFromDatasets,
  decisionTelemetryProps,
  parseDecisionAggregateEvent,
  stageForDecisionAction,
} from "./telemetry";

describe("decision telemetry contract", () => {
  it("emits one stable event name per funnel stage", () => {
    expect(decisionEventName("impression")).toBe("decision_impression");
    expect(decisionEventName("feedback", "helpful")).toBe("decision_helpful");
    expect(decisionEventName("feedback", "not_relevant")).toBe("decision_not_relevant");
    expect(stageForDecisionAction("open")).toBe("open");
    expect(stageForDecisionAction("directions")).toBe("action");
    expect(stageForDecisionAction("helpful")).toBe("feedback");
    expect(stageForDecisionAction("not_relevant")).toBe("feedback");
  });

  it("keeps only categorical context and a public entity identifier", () => {
    expect(
      decisionTelemetryProps({
        stage: "action",
        surface: "today",
        entityKind: "place",
        entityId: "gravel-and-grind-frederick",
        position: "lead",
        action: "directions",
      }),
    ).toEqual({
      surface: "today",
      entity_kind: "place",
      entity_id: "gravel-and-grind-frederick",
      position: "lead",
      action: "directions",
    });
  });

  it("rejects free text instead of attempting to sanitize it", () => {
    expect(
      decisionTelemetryProps({
        stage: "open",
        surface: "ask",
        entityKind: "answer",
        entityId: "coffee and bikes near me?",
        position: "result",
        action: "open",
      }),
    ).toBeNull();
  });

  it("inherits card context for a nested action", () => {
    expect(
      decisionTelemetryFromDatasets(
        { decisionAction: "call" },
        {
          decisionSurface: "ask",
          decisionEntity: "place",
          decisionId: "cafe-nola-frederick",
          decisionPosition: "lead",
        },
      ),
    ).toEqual({
      stage: "action",
      surface: "ask",
      entityKind: "place",
      entityId: "cafe-nola-frederick",
      position: "lead",
      action: "call",
    });
  });

  it("counts a visible clickable card as an impression, not an open", () => {
    expect(
      decisionImpressionFromDataset({
        decisionSurface: "today",
        decisionEntity: "place",
        decisionId: "cafe-nola-frederick",
        decisionPosition: "lead",
        decisionAction: "open",
      }),
    ).toEqual({
      stage: "impression",
      surface: "today",
      entityKind: "place",
      entityId: "cafe-nola-frederick",
      position: "lead",
    });
  });

  it("reduces a canonical event to fixed anonymous aggregate dimensions", () => {
    expect(
      parseDecisionAggregateEvent("decision_action", {
        surface: "map",
        entity_kind: "place",
        entity_id: "gravel-and-grind-frederick",
        position: "sheet",
        action: "directions",
      }),
    ).toEqual({
      surface: "map",
      stage: "action",
      entityKind: "place",
      position: "sheet",
      action: "directions",
    });
  });

  it("does not accept arbitrary dimensions or mismatched event semantics", () => {
    const base = {
      surface: "ask",
      entity_kind: "answer",
      entity_id: "ask-answer",
      position: "result",
    };
    expect(
      parseDecisionAggregateEvent("decision_impression", {
        ...base,
        query: "coffee near me",
      }),
    ).toBeNull();
    expect(
      parseDecisionAggregateEvent("decision_open", {
        ...base,
        action: "directions",
      }),
    ).toBeNull();
    expect(
      parseDecisionAggregateEvent("decision_helpful", {
        ...base,
        action: "wrong",
      }),
    ).toBeNull();
  });

  it("derives correction entities only from canonical public routes", () => {
    expect(decisionEntityFromPath("/events/alive-at-five-2026?from=ask")).toEqual({
      entityKind: "event",
      entityId: "alive-at-five-2026",
    });
    expect(decisionEntityFromPath(null)).toEqual({
      entityKind: "answer",
      entityId: "ask-answer",
    });
  });

  it("derives only coarse surface context from a pathname", () => {
    expect(decisionContextFromPath("/today")).toEqual({
      surface: "today",
      position: "result",
    });
    expect(decisionContextFromPath("/places/cafe-nola-frederick")).toEqual({
      surface: "place",
      position: "detail",
    });
  });
});
