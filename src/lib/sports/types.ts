export type LocalSportsTeamId = "hood" | "mount" | "fcc";

export type SportsGameState =
  | "scheduled"
  | "live"
  | "final"
  | "postponed"
  | "cancelled";

export type SportsGame = {
  id: string;
  teamId: LocalSportsTeamId;
  teamName: string;
  teamNickname: string;
  sport: string;
  startsAt: string;
  timeTba: boolean;
  homeAway: "home" | "away" | "neutral";
  opponent: string;
  venue: string | null;
  location: string | null;
  state: SportsGameState;
  result: "W" | "L" | "T" | null;
  teamScore: string | null;
  opponentScore: string | null;
  sourceUrl: string;
  watchUrl: string | null;
  statsUrl: string | null;
  ticketsUrl: string | null;
  recapUrl: string | null;
  verifiedAt: string;
};
