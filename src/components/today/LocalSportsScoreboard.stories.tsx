import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { SportsGame } from "@/lib/sports/types";
import { SPORTS_TEAM_IDENTITIES } from "@/lib/sports/team-identity";
import LocalSportsScoreboard from "./LocalSportsScoreboard";

// Isolated component states, not a claim about today's published games.
const fixture: SportsGame = {
  id: "hood-story", teamId: "hood", teamName: "Hood College", teamNickname: "Blazers", sport: "Men's Soccer",
  startsAt: "2026-08-22T21:00:00Z", timeTba: false, homeAway: "home", opponent: "Frederick Community College",
  venue: "Thomas Athletic Field", location: "Frederick, MD", state: "scheduled", result: null, teamScore: null, opponentScore: null,
  sourceUrl: "https://hoodathletics.com/calendar", watchUrl: null, statsUrl: null, ticketsUrl: null, recapUrl: null, verifiedAt: "2026-07-23T12:00:00Z",
};
const games: SportsGame[] = [
  fixture,
  { ...fixture, id: "mount-story", teamId: "mount", teamName: "Mount St. Mary's", teamNickname: "Mountaineers", sport: "Basketball", opponent: "Conference opponent", homeAway: "away", state: "live" },
  { ...fixture, id: "fcc-story", teamId: "fcc", teamName: "Frederick Community College", teamNickname: "Cougars", sport: "Baseball", opponent: "Conference opponent", state: "final", result: "L", teamScore: "0", opponentScore: "1" },
];
const meta = {
  title: "Today/Team scoreboard",
  component: LocalSportsScoreboard,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "min(358px, calc(100vw - 32px))" }}><Story /></div>],
  beforeEach: () => {
    const previousFetch = window.fetch;
    const fixtureFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/sports/local") return Promise.resolve(new Response(JSON.stringify({ games }), { headers: { "Content-Type": "application/json" } }));
      return previousFetch(input, init);
    };
    window.fetch = fixtureFetch;
    return () => { if (window.fetch === fixtureFetch) window.fetch = previousFetch; };
  },
} satisfies Meta<typeof LocalSportsScoreboard>;
export default meta;
type Story = StoryObj<typeof meta>;

async function readableTeams(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole("heading", { name: "Frederick teams today" })).toBeVisible();
  for (const id of ["hood", "mount", "fcc"] as const) {
    const row = canvasElement.querySelector<HTMLElement>(`[data-sports-team="${id}"]`)!;
    await expect(within(row).getByText(SPORTS_TEAM_IDENTITIES[id].nickname)).toBeVisible();
    const badge = row.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    await expect(getComputedStyle(badge).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
  }
  await expect(canvas.getByText("L 0–1")).toBeVisible();
  await expect(canvas.getByText("Away game")).toBeVisible();
  const action = canvas.getByRole("link", { name: "All sports" });
  await expect(action.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  await waitFor(() => expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1));
}
export const TeamColors: Story = { play: ({ canvasElement }) => readableTeams(canvasElement) };
export const NarrowScoreboard: Story = {
  render: () => <div style={{ width: "min(288px, 100%)" }}><LocalSportsScoreboard /></div>,
  play: ({ canvasElement }) => readableTeams(canvasElement),
};
