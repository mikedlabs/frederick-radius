import { describe, it, expect } from "vitest";
import { normalizeKeysScore } from "./keysScore";

const KEYS = 493;

// Minimal statsapi /schedule?hydrate=team,linescore shape.
function game(over: Record<string, unknown> = {}) {
  return {
    gamePk: 1,
    gameDate: "2026-07-03T23:05:00Z",
    status: { abstractGameState: "Live", detailedState: "In Progress" },
    teams: {
      home: { team: { id: KEYS, name: "Frederick Keys" }, score: 4 },
      away: { team: { id: 999, name: "Hudson Valley Renegades" }, score: 2 },
    },
    linescore: { currentInningOrdinal: "7th", inningState: "Bottom", outs: 1 },
    ...over,
  };
}
const sched = (games: unknown[]) => ({ dates: [{ games }] });

describe("normalizeKeysScore", () => {
  it("returns null when no Keys game is present", () => {
    expect(normalizeKeysScore({ dates: [] })).toBeNull();
    expect(normalizeKeysScore(sched([{ ...game(), teams: { home: { team: { id: 1 } }, away: { team: { id: 2 } } } }]))).toBeNull();
    expect(normalizeKeysScore(null)).toBeNull();
  });

  it("reads a live home game: score, inning, outs, keysHome", () => {
    const s = normalizeKeysScore(sched([game()]))!;
    expect(s.state).toBe("live");
    expect(s.keysHome).toBe(true);
    expect(s.keys).toEqual({ name: "Frederick Keys", runs: 4 });
    expect(s.opponent).toEqual({ name: "Hudson Valley Renegades", runs: 2 });
    expect(s.inningOrdinal).toBe("7th");
    expect(s.inningState).toBe("Bottom");
    expect(s.outs).toBe(1);
  });

  it("handles an away game — Keys are the away side", () => {
    const s = normalizeKeysScore(
      sched([
        game({
          teams: {
            home: { team: { id: 999, name: "Renegades" }, score: 2 },
            away: { team: { id: KEYS, name: "Frederick Keys" }, score: 8 },
          },
        }),
      ]),
    )!;
    expect(s.keysHome).toBe(false);
    expect(s.keys.runs).toBe(8);
    expect(s.opponent.name).toBe("Renegades");
  });

  it("final game keeps the score but drops live inning fields", () => {
    const s = normalizeKeysScore(
      sched([game({ status: { abstractGameState: "Final", detailedState: "Final" } })]),
    )!;
    expect(s.state).toBe("final");
    expect(s.inningOrdinal).toBeNull();
    expect(s.outs).toBeNull();
    expect(s.keys.runs).toBe(4);
  });

  it("pre-game has null runs and null inning", () => {
    const s = normalizeKeysScore(
      sched([
        game({
          status: { abstractGameState: "Preview", detailedState: "Scheduled" },
          teams: {
            home: { team: { id: KEYS, name: "Frederick Keys" } },
            away: { team: { id: 999, name: "Renegades" } },
          },
          linescore: {},
        }),
      ]),
    )!;
    expect(s.state).toBe("pre");
    expect(s.keys.runs).toBeNull();
    expect(s.opponent.runs).toBeNull();
    expect(s.inningOrdinal).toBeNull();
  });

  it("maps postponed / cancelled from detailedState", () => {
    expect(
      normalizeKeysScore(sched([game({ status: { abstractGameState: "Preview", detailedState: "Postponed" } })]))!.state,
    ).toBe("postponed");
    expect(
      normalizeKeysScore(sched([game({ status: { abstractGameState: "Preview", detailedState: "Cancelled" } })]))!.state,
    ).toBe("cancelled");
  });

  it("doubleheader: prefers the LIVE game over a finished one", () => {
    const finished = game({ gamePk: 10, gameDate: "2026-07-03T17:00:00Z", status: { abstractGameState: "Final", detailedState: "Final" } });
    const live = game({ gamePk: 11, gameDate: "2026-07-03T21:00:00Z" });
    const s = normalizeKeysScore(sched([finished, live]))!;
    expect(s.gamePk).toBe(11);
    expect(s.state).toBe("live");
  });

  it("no live game: falls back to the latest by first pitch", () => {
    const early = game({ gamePk: 10, gameDate: "2026-07-03T17:00:00Z", status: { abstractGameState: "Final", detailedState: "Final" } });
    const late = game({ gamePk: 11, gameDate: "2026-07-03T21:00:00Z", status: { abstractGameState: "Final", detailedState: "Final" } });
    const s = normalizeKeysScore(sched([early, late]))!;
    expect(s.gamePk).toBe(11);
  });
});
