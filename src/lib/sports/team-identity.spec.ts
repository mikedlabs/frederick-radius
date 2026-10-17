import { describe, expect, it } from "vitest";
import { SPORTS_TEAM_IDENTITIES, sportsTeamStyle } from "./team-identity";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(first: string, second: string): number {
  const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}

describe("official team identity plates", () => {
  it.each(Object.entries(SPORTS_TEAM_IDENTITIES))("keeps %s labels readable independently of app appearance", (_id, team) => {
    expect(contrast(team.primary, team.onPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(team.secondary, team.onSecondary)).toBeGreaterThanOrEqual(4.5);
    expect(new URL(team.source).protocol).toBe("https:");
  });

  it("uses separate real identities for the navy colleges and green/yellow Cougars", () => {
    expect(sportsTeamStyle("hood")["--team-primary"]).toBe("#132E53");
    expect(sportsTeamStyle("mount")["--team-primary"]).toBe("#002855");
    expect(sportsTeamStyle("mount")["--team-secondary"]).toBe("#84754E");
    expect(sportsTeamStyle("fcc")["--team-primary"]).toBe("#006341");
    expect(sportsTeamStyle("fcc")["--team-secondary"]).toBe("#FAAB18");
  });

  it("distinguishes formal guides, published website colors and the preserved Keys value", () => {
    expect(SPORTS_TEAM_IDENTITIES.hood.sourceBasis).toBe("brand-guide");
    expect(SPORTS_TEAM_IDENTITIES.mount.sourceBasis).toBe("brand-guide");
    expect(SPORTS_TEAM_IDENTITIES.cows.sourceBasis).toBe("official-site");
    expect(SPORTS_TEAM_IDENTITIES.cows.secondary).toBe("#FABBCB");
    expect(SPORTS_TEAM_IDENTITIES.keys.sourceBasis).toBe("existing-product");
    expect(SPORTS_TEAM_IDENTITIES.keys.secondary).toBe("#DF4601");
  });
});
