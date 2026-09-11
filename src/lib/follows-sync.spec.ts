import { describe, expect, it } from "vitest";
import {
  clearFollowsSync,
  followsSyncKey,
  hasCompletedFollowsSync,
  markFollowsSyncComplete,
} from "./follows-sync";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("follows sync account marker", () => {
  it("uses a different marker for each account on the same device", () => {
    expect(followsSyncKey("user-a")).not.toBe(followsSyncKey("user-b"));
  });

  it("does not let one account's completed import suppress another account", () => {
    const storage = memoryStorage();

    markFollowsSyncComplete(storage, "user-a");

    expect(hasCompletedFollowsSync(storage, "user-a")).toBe(true);
    expect(hasCompletedFollowsSync(storage, "user-b")).toBe(false);
  });

  it("clears only the requested account marker", () => {
    const storage = memoryStorage();
    markFollowsSyncComplete(storage, "user-a");
    markFollowsSyncComplete(storage, "user-b");

    clearFollowsSync(storage, "user-a");

    expect(hasCompletedFollowsSync(storage, "user-a")).toBe(false);
    expect(hasCompletedFollowsSync(storage, "user-b")).toBe(true);
  });
});
