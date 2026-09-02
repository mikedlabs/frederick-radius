import { describe, it, expect } from "vitest";
import {
  parseFeedback,
  buildFeedbackOwnerAlert,
  buildFeedbackRow,
  FAIR_FEEDBACK_MAX_CONTEXT,
  FAIR_FEEDBACK_PATHNAME,
  FEEDBACK_OWNER_ALERT_MAX_BODY,
  FEEDBACK_MAX_MESSAGE,
} from "@/lib/feedback";

describe("parseFeedback", () => {
  it("accepts a plain note and trims it, with no email", () => {
    const r = parseFeedback({ message: "  The map is quick.  ", pathname: "/map" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.message).toBe("The map is quick.");
      expect(r.value.email).toBeNull();
      expect(r.value.pathname).toBe("/map");
      expect(r.value.version).toBeNull();
      expect(r.value.fairIssue).toBeNull();
      expect(r.value.fairContext).toBeNull();
    }
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(parseFeedback({ message: "" }).ok).toBe(false);
    expect(parseFeedback({ message: "   " }).ok).toBe(false);
    expect(parseFeedback({}).ok).toBe(false);
    expect(parseFeedback(null).ok).toBe(false);
    expect(parseFeedback("nope").ok).toBe(false);
  });

  it("rejects a message past the length cap", () => {
    const tooLong = parseFeedback({ message: "x".repeat(FEEDBACK_MAX_MESSAGE + 1) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toBe("too-long");
    // Exactly at the cap is fine.
    expect(parseFeedback({ message: "x".repeat(FEEDBACK_MAX_MESSAGE) }).ok).toBe(true);
  });

  it("keeps a valid email, lowercased; rejects a malformed one", () => {
    const good = parseFeedback({ message: "hi", email: "  Sam@Example.COM " });
    expect(good.ok && good.value.email).toBe("sam@example.com");
    const bad = parseFeedback({ message: "hi", email: "not-an-email" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("bad-email");
  });

  it("clamps overlong pathname and version but keeps a message", () => {
    const r = parseFeedback({
      message: "note",
      pathname: "/" + "a".repeat(1000),
      version: "v".repeat(200),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pathname?.length).toBeLessThanOrEqual(512);
      expect(r.value.version?.length).toBeLessThanOrEqual(80);
    }
  });

  it("accepts fixed Fair metadata only on the Fair surface", () => {
    const r = parseFeedback({
      message: "  The entrance marker is one gate too far north.  ",
      pathname: FAIR_FEEDBACK_PATHNAME,
      fairIssue: "map_wrong",
      fairContext: "  Gate  3\n· reviewed map feature  ",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        source: "feedback-widget",
        fairIssue: "map_wrong",
        fairContext: "Gate 3 · reviewed map feature",
      });
    }
  });

  it("rejects unknown, oversized, or off-surface Fair metadata", () => {
    const cases = [
      {
        body: {
          message: "note",
          pathname: FAIR_FEEDBACK_PATHNAME,
          fairIssue: "medical_emergency",
        },
        error: "bad-fair-issue",
      },
      {
        body: {
          message: "note",
          pathname: "/today",
          fairIssue: "parking_entry",
        },
        error: "bad-fair-surface",
      },
      {
        body: {
          message: "note",
          pathname: FAIR_FEEDBACK_PATHNAME,
          fairIssue: "map_wrong",
          fairContext: "x".repeat(FAIR_FEEDBACK_MAX_CONTEXT + 1),
        },
        error: "fair-context-too-long",
      },
      {
        body: {
          source: "ask-correction",
          reason: "unhelpful",
          pathname: "/ask",
          fairIssue: "other",
        },
        error: "bad-fair-surface",
      },
    ];

    for (const entry of cases) {
      const result = parseFeedback(entry.body);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(entry.error);
    }
  });

  it("accepts a bounded Ask correction without storing the question or answer", () => {
    const r = parseFeedback({
      source: "ask-correction",
      reason: "too_far",
      resultRef: "/places/far-away-coffee?from=ask#hours",
      pathname: "/ask",
      // Corrections build their note on the server; client prose is ignored.
      message: "private question and answer text",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        source: "ask-correction",
        reason: "too_far",
        resultRef: "/places/far-away-coffee",
        pathname: "/ask",
        email: null,
        message:
          "Ask answer marked: Too far away. Result: /places/far-away-coffee.",
      });
      expect(r.value.message).not.toContain("private question");
    }
  });

  it("rejects unknown correction reasons and arbitrary result references", () => {
    const unknownReason = parseFeedback({
      source: "ask-correction",
      reason: "something_else",
    });
    expect(unknownReason.ok).toBe(false);
    if (!unknownReason.ok) expect(unknownReason.error).toBe("bad-reason");

    for (const resultRef of [
      "https://example.com/places/cafe",
      "/admin/beta",
      "/places/../../private",
    ]) {
      const badRef = parseFeedback({
        source: "ask-correction",
        reason: "unhelpful",
        resultRef,
      });
      expect(badRef.ok).toBe(false);
      if (!badRef.ok) expect(badRef.error).toBe("bad-result-ref");
    }
  });
});

describe("buildFeedbackRow", () => {
  it("shapes a submissions insert with kind=feedback and a server commit stamp", () => {
    const row = buildFeedbackRow(
      {
        message: "Events load fast.",
        email: "a@b.co",
        pathname: "/events",
        version: null,
        source: "feedback-widget",
        reason: null,
        resultRef: null,
        fairIssue: null,
        fairContext: null,
      },
      "abc123",
    );
    expect(row.kind).toBe("feedback");
    expect(row.submitter_email).toBe("a@b.co");
    expect(row.payload).toEqual({
      message: "Events load fast.",
      pathname: "/events",
      version: null,
      commit: "abc123",
      source: "feedback-widget",
    });
  });

  it("stores a null commit (and null email) when neither is present", () => {
    const row = buildFeedbackRow(
      {
        message: "note",
        email: null,
        pathname: null,
        version: null,
        source: "feedback-widget",
        reason: null,
        resultRef: null,
        fairIssue: null,
        fairContext: null,
      },
      null,
    );
    expect(row.submitter_email).toBeNull();
    expect(row.payload.commit).toBeNull();
  });

  it("keeps an Ask correction structured in the existing feedback queue", () => {
    const parsed = parseFeedback({
      source: "ask-correction",
      reason: "hours_wrong",
      resultRef: "/events/alive-at-five",
      pathname: "/ask",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(buildFeedbackRow(parsed.value, "deploy123")).toEqual({
      kind: "feedback",
      payload: {
        message:
          "Ask answer marked: Hours are wrong. Result: /events/alive-at-five.",
        pathname: "/ask",
        version: null,
        commit: "deploy123",
        source: "ask-correction",
        reason: "hours_wrong",
        result_ref: "/events/alive-at-five",
      },
      submitter_email: null,
    });
  });

  it("keeps a Fair report structured in the existing feedback queue", () => {
    const parsed = parseFeedback({
      message: "The restroom sign points to a locked building.",
      pathname: FAIR_FEEDBACK_PATHNAME,
      fairIssue: "restroom_help",
      fairContext: "Building 9 restroom",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(buildFeedbackRow(parsed.value, "deploy456").payload).toMatchObject({
      source: "feedback-widget",
      fair_issue: "restroom_help",
      fair_context: "Building 9 restroom",
    });
  });
});

describe("buildFeedbackOwnerAlert", () => {
  it("puts the Fair category and context at the front of the owner alert", () => {
    const parsed = parseFeedback({
      message: "The marker points to the other side of the path.",
      pathname: FAIR_FEEDBACK_PATHNAME,
      fairIssue: "map_wrong",
      fairContext: "Gate 3",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(buildFeedbackOwnerAlert(parsed.value)).toEqual({
      title: "Fair map or location report",
      body: "Gate 3 · The marker points to the other side of the path.",
    });
  });

  it("keeps an accessibility barrier distinct in storage and owner alerts", () => {
    const parsed = parseFeedback({
      message: "The route from the shuttle drop-off has a blocked curb cut.",
      pathname: FAIR_FEEDBACK_PATHNAME,
      fairIssue: "access_barrier",
      fairContext: "Gate 4A",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(buildFeedbackRow(parsed.value, "deploy789").payload).toMatchObject({
      fair_issue: "access_barrier",
      fair_context: "Gate 4A",
    });
    expect(buildFeedbackOwnerAlert(parsed.value)).toEqual({
      title: "Fair accessibility report",
      body:
        "Gate 4A · The route from the shuttle drop-off has a blocked curb cut.",
    });
  });

  it("keeps generic feedback generic and bounds phone-alert copy", () => {
    const parsed = parseFeedback({
      message: "x".repeat(300),
      pathname: "/events",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const alert = buildFeedbackOwnerAlert(parsed.value);
    expect(alert.title).toBe("Site feedback");
    expect(alert.body.length).toBe(FEEDBACK_OWNER_ALERT_MAX_BODY);
    expect(alert.body.endsWith("…")).toBe(true);
  });
});
