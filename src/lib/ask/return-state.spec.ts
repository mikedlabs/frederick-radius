import { describe, expect, it } from "vitest";
import {
  ASK_RETURN_TTL_MS,
  historyStateWithAskReturn,
  readAskReturnSnapshot,
  writeAskReturnSnapshot,
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
