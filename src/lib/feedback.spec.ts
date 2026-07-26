import { describe, it, expect } from "vitest";
import {
  parseFeedback,
  buildFeedbackRow,
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
});

describe("buildFeedbackRow", () => {
  it("shapes a submissions insert with kind=feedback and a server commit stamp", () => {
    const row = buildFeedbackRow(
      { message: "Events load fast.", email: "a@b.co", pathname: "/events", version: null },
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
      { message: "note", email: null, pathname: null, version: null },
      null,
    );
    expect(row.submitter_email).toBeNull();
    expect(row.payload.commit).toBeNull();
  });
});
