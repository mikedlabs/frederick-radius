import type { CSSProperties } from "react";
import type { LocalSportsTeamId } from "./types";

export type SportsTeamId = LocalSportsTeamId | "keys" | "cows";

type TeamIdentity = {
  name: string;
  nickname: string;
  monogram: string;
  primary: string;
  secondary: string;
  onPrimary: string;
  onSecondary: string;
  source: string;
  sourceBasis: "brand-guide" | "official-site" | "existing-product";
};

/**
 * Another team's identity is deliberately separate from the Radius palette.
 * Verified 2026-10-17. Colors are presentation metadata, never game/feed state.
 * Monograms are plain text labels, not replacement or recreated team logos.
 *
 * Hood's May2025 guide p43 supplies navy/steel; Athletics confirmed its move
 * to navy in https://hoodathletics.com/news/2021/8/25/general-blazers-release-new-logo-and-branding.aspx.
 * Mount's official2024 guide p19 supplies navy/gold. FCC's athletics site
 * explicitly names green/yellow/white and publishes the exact values as
 * theme-primary-color and theme-secondary-color in its current homepage.
 * The Cows values are its active official website kit, not a formal brand guide.
 * Keys orange preserves the existing KeysScore/KeysCard value; the official
 *2026 brand announcement confirms orange/black, without publishing a hex table.
 */
export const SPORTS_TEAM_IDENTITIES = {
  hood: {
    name: "Hood College", nickname: "Blazers", monogram: "HC",
    primary: "#132E53", secondary: "#A4A6A4", onPrimary: "#FFFFFF", onSecondary: "#000000",
    source: "https://www.hood.edu/sites/default/files/2025-05/_hc_brand-guidelines_may25-web.pdf",
    sourceBasis: "brand-guide",
  },
  mount: {
    name: "Mount St. Mary's", nickname: "Mountaineers", monogram: "MSM",
    primary: "#002855", secondary: "#84754E", onPrimary: "#FFFFFF", onSecondary: "#000000",
    source: "https://inside.msmary.edu/more/marketing-and-communications/files/msmu-brand-standards-guide-university.pdf",
    sourceBasis: "brand-guide",
  },
  fcc: {
    name: "Frederick Community College", nickname: "Cougars", monogram: "FCC",
    primary: "#006341", secondary: "#FAAB18", onPrimary: "#FFFFFF", onSecondary: "#000000",
    source: "https://www.fccathletics.com/",
    sourceBasis: "official-site",
  },
  keys: {
    name: "Frederick Keys", nickname: "Keys", monogram: "FK",
    primary: "#000000", secondary: "#DF4601", onPrimary: "#FFFFFF", onSecondary: "#000000",
    source: "https://www.milb.com/news/frederick-keys-release-new-firework-jersey-and-logos",
    sourceBasis: "existing-product",
  },
  "cows": {
    name: "Frederick Flying Cows", nickname: "Flying Cows", monogram: "FC",
    primary: "#000000", secondary: "#FABBCB", onPrimary: "#FFFFFF", onSecondary: "#000000",
    source: "https://goflyingcows.com/wp-content/uploads/elementor/css/post-2269.css?ver=1792142258",
    sourceBasis: "official-site",
  },
} as const satisfies Record<SportsTeamId, TeamIdentity>;

export type SportsTeamStyle = CSSProperties & Record<
  "--team-primary" | "--team-secondary" | "--team-on-primary" | "--team-on-secondary",
  string
>;

export function sportsTeamStyle(teamId: SportsTeamId): SportsTeamStyle {
  const team = SPORTS_TEAM_IDENTITIES[teamId];
  return {
    "--team-primary": team.primary,
    "--team-secondary": team.secondary,
    "--team-on-primary": team.onPrimary,
    "--team-on-secondary": team.onSecondary,
  };
}
