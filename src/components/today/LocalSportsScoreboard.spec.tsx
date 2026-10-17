// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SportsGame } from "@/lib/sports/types";
import LocalSportsScoreboard from "./LocalSportsScoreboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let request: ReturnType<typeof vi.fn>;
const game: SportsGame = {
  id: "hood-fixture", teamId: "hood", teamName: "Hood College", teamNickname: "Blazers", sport: "Men's Soccer",
  startsAt: "2026-08-22T21:00:00Z", timeTba: false, homeAway: "home", opponent: "Frederick Community College",
  venue: "Thomas Athletic Field", location: "Frederick, MD", state: "scheduled", result: null, teamScore: null, opponentScore: null,
  sourceUrl: "https://hoodathletics.com/calendar", watchUrl: null, statsUrl: null, ticketsUrl: "https://hoodathletics.com/tickets/10", recapUrl: null, verifiedAt: "2026-07-23T12:00:00Z",
};
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  request = vi.fn(); vi.stubGlobal("fetch", request);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});
async function render(games: SportsGame[]) {
  request.mockResolvedValue({ ok: true, json: async () => ({ games }) });
  await act(async () => root.render(<LocalSportsScoreboard />));
}

describe("Today team identities", () => {
  it("keeps the team identity separate from the opponent and home-only ticket action", async () => {
    await render([
      game,
      { ...game, id: "fcc-away", teamId: "fcc", teamName: "Frederick Community College", teamNickname: "Cougars", opponent: "Hood College", homeAway: "away", state: "live", ticketsUrl: "https://www.fccathletics.com/away-tickets" },
    ]);
    const hood = container.querySelector<HTMLElement>('[data-sports-team="hood"]')!;
    const fcc = container.querySelector<HTMLElement>('[data-sports-team="fcc"]')!;
    expect(hood.style.getPropertyValue("--team-primary")).toBe("#132E53");
    expect(hood.textContent).toContain("Blazers");
    expect(hood.textContent).toContain("vs. Frederick Community College");
    expect(hood.textContent).toContain("Home game");
    expect(hood.querySelector('a[href="https://hoodathletics.com/tickets/10"]')).not.toBeNull();
    expect(fcc.style.getPropertyValue("--team-primary")).toBe("#006341");
    expect(fcc.style.getPropertyValue("--team-secondary")).toBe("#FAAB18");
    expect(fcc.textContent).toContain("at Hood College");
    expect(fcc.textContent).toContain("Live");
    expect(fcc.textContent).toContain("Away game");
    expect(fcc.querySelector("a")).toBeNull();
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/sports/local", { cache: "no-store" });
  });

  it("retains exact final scores, a neutral venue and unpublished-time uncertainty", async () => {
    await render([
      { ...game, state: "final", result: "L", teamScore: "0", opponentScore: "1", homeAway: "neutral", ticketsUrl: null },
      { ...game, id: "time-tba", timeTba: true, ticketsUrl: null },
    ]);
    expect(container.textContent).toContain("L 0–1");
    expect(container.textContent).toContain("Neutral site");
    expect(container.textContent).toContain("Time TBA");
  });

  it("takes no page space and makes no retry calls for an empty or failed read", async () => {
    await render([]);
    expect(container.querySelector("section")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<LocalSportsScoreboard />));
    expect(container.querySelector("section")).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
