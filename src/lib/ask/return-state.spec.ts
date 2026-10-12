import { describe, expect, it } from "vitest";
import {
  ASK_RETURN_TTL_MS,
  historyStateWithAskReturn,
  readAskReturnSnapshot,
  writeAskReturnSnapshot,
  takeAskUpdateDraft,
  writeAskUpdateDraft,
  type AskReturnSnapshot,
} from "./return-state";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function snapshot(
  overrides: Partial<AskReturnSnapshot<{ answer: string }>> = {},
): AskReturnSnapshot<{ answer: string }> {
  return {
    version: 1,
    id: "return-1",
    savedAt: 1_000,
    query: "coffee near me",
    draft: "",
    submittedQuery: "coffee near me",
    permalinkQuery: "coffee near me",
    result: { answer: "Try the closest independent shop." },
    requestFailure: null,
    showAllSources: true,
    scope: "nearme",
    scrollY: 640,
    clickedSourceIndex: 3,
    ...overrides,
  };
}

describe("Ask return-state restoration", () => {
  it("restores only when the browser history entry and query match", () => {
    const storage = memoryStorage();
    const saved = snapshot();
    expect(writeAskReturnSnapshot(storage, saved)).toBe(true);
    const history = historyStateWithAskReturn({ __NA: true }, saved.id);

    expect(
      readAskReturnSnapshot<{ answer: string }>(
        storage,
        history,
        "coffee near me",
        2_000,
      ),
    ).toEqual(saved);
    expect(
      readAskReturnSnapshot(storage, history, "dinner tonight", 2_000),
    ).toBeNull();
    expect(
      readAskReturnSnapshot(storage, { __NA: true }, "coffee near me", 2_000),
    ).toBeNull();
  });

  it("preserves Next's history fields when adding the return marker", () => {
    const current = { __NA: true, tree: ["ask"] };
    expect(historyStateWithAskReturn(current, "return-2")).toEqual({
      __NA: true,
      tree: ["ask"],
      __frAskReturn: "return-2",
    });
  });

  it("expires time-sensitive answers after the bounded return window", () => {
    const storage = memoryStorage();
    const saved = snapshot();
    writeAskReturnSnapshot(storage, saved);
    const history = historyStateWithAskReturn({}, saved.id);

    expect(
      readAskReturnSnapshot(
        storage,
        history,
        saved.query,
        saved.savedAt + ASK_RETURN_TTL_MS + 1,
      ),
    ).toBeNull();
  });

  it.each(["timeout", "cancelled"] as const)(
    "preserves an actionable %s failure",
    (requestFailure) => {
      const storage = memoryStorage();
      const saved = snapshot({ requestFailure });
      writeAskReturnSnapshot(storage, saved);

      expect(
        readAskReturnSnapshot(
          storage,
          historyStateWithAskReturn({}, saved.id),
          saved.query,
          saved.savedAt + 1,
        ),
      ).toEqual(saved);
    },
  );

  it("ignores malformed or partial session data", () => {
    const storage = memoryStorage();
    storage.setItem("fr:ask:return:v1:broken", '{"version":1,"id":"broken"}');

    expect(
      readAskReturnSnapshot(
        storage,
        historyStateWithAskReturn({}, "broken"),
        "coffee near me",
        2_000,
      ),
    ).toBeNull();
  });
});


describe("Ask words retained for an accepted app update", () => {
  const key = "fr:ask:update-draft:v1";

  it("keeps one bounded words-only record and consumes it once", () => {
    const storage = memoryStorage();
    expect(writeAskUpdateDraft(storage, "x".repeat(400), "  prior question  ", 1_000)).toBe(true);
    expect(JSON.parse(storage.getItem(key)!)).toEqual({
      version: 1, savedAt: 1_000, draft: "x".repeat(300), question: "prior question",
    });
    expect(takeAskUpdateDraft(storage, "prior question", 2_000)).toBe("x".repeat(300));
    expect(storage.getItem(key)).toBeNull();
    expect(takeAskUpdateDraft(storage, "prior question", 2_000)).toBeNull();
  });

  it("preserves an explicitly cleared draft", () => {
    const storage = memoryStorage();
    writeAskUpdateDraft(storage, "", "prior question", 1_000);
    expect(takeAskUpdateDraft(storage, "prior question", 2_000)).toBe("");
  });

  it("does not move words into another question", () => {
    const storage = memoryStorage();
    writeAskUpdateDraft(storage, "edited words", "prior question", 1_000);
    expect(takeAskUpdateDraft(storage, "different question", 2_000)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it.each([
    "not json",
    "null",
    JSON.stringify({ version: 2, savedAt: 1_000, question: "", draft: "ignored" }),
    JSON.stringify({ version: 1, savedAt: 1_000, question: "", draft: "x".repeat(301) }),
    JSON.stringify({ version: 1, savedAt: 1_000, question: "", draft: 42 }),
    JSON.stringify({ version: 1, savedAt: 100_000, question: "", draft: "future" }),
  ])("discards malformed or future update data: %s", (raw) => {
    const storage = memoryStorage();
    storage.setItem(key, raw);
    expect(takeAskUpdateDraft(storage, "", 2_000)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("discards stale words after the bounded return window", () => {
    const storage = memoryStorage();
    writeAskUpdateDraft(storage, "old words", "prior question", 1_000);
    expect(takeAskUpdateDraft(storage, "prior question", 1_000 + ASK_RETURN_TTL_MS + 1)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("fails quietly when storage writes or reads are blocked", () => {
    const blocked = {
      getItem: () => { throw new Error("blocked read"); },
      setItem: () => { throw new Error("blocked write"); },
      removeItem: () => { throw new Error("blocked removal"); },
    };
    expect(writeAskUpdateDraft(blocked, "words", "", 1_000)).toBe(false);
    expect(takeAskUpdateDraft(blocked, "", 2_000)).toBeNull();
  });
});
