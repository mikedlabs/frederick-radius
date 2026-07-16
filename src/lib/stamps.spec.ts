import { describe, expect, it } from "vitest";
import { deriveStamps } from "./stamps";

const base = {
  visited: [] as string[],
  notesCount: 0,
  breweryVisits: 0,
  townOf: () => undefined,
};

describe("deriveStamps", () => {
  it("does not award the first-place stamp for an event save", () => {
    const states = deriveStamps({
      ...base,
      saved: [{ type: "event", id: "concert", saved_at: "2026-07-15T12:00:00Z" }],
    });
    expect(states.find((state) => state.def.key === "first-mark")?.earned).toBe(false);
    expect(states.find((state) => state.def.key === "calendar-keeper")?.progress.done).toBe(1);
  });

  it("awards it after the first actual place save", () => {
    const states = deriveStamps({
      ...base,
      saved: [{ type: "place", id: "cafe-nola", saved_at: "2026-07-15T12:00:00Z" }],
    });
    expect(states.find((state) => state.def.key === "first-mark")?.earned).toBe(true);
  });
});
