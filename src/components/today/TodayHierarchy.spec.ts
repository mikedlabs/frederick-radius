import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");

describe("Today decision hierarchy", () => {
  const renderedPage = todayPage.slice(todayPage.indexOf("<EventSheetBoundary"));

  it("puts exactly one decision lead below weather, before Ask, Browse, and the event program", () => {
    const weather = renderedPage.indexOf("</SkyHero>");
    const lead = renderedPage.indexOf("{decisionLead}");
    const ask = renderedPage.indexOf("<TodayAsk embedded");
    const browse = renderedPage.indexOf("<BrowsePlacesDisclosure embedded");
    const events = renderedPage.indexOf("{whatsOn}");

    expect(weather).toBeGreaterThan(-1);
    expect(lead).toBeGreaterThan(weather);
    expect(ask).toBeGreaterThan(lead);
    expect(browse).toBeGreaterThan(ask);
    expect(events).toBeGreaterThan(browse);
  });

  it("streams the event decision over the existing place answer with one shared promise", () => {
    const decisionStart = todayPage.indexOf("const decisionLead =");
    const decisionEnd = todayPage.indexOf(
      "const availableToday =",
      decisionStart,
    );
    const decision = todayPage.slice(decisionStart, decisionEnd);

    expect(decision).toContain(
      "fallback={<OpenPlaceLead rows={daypartRows} note={daypartNote} />}",
    );
    expect(decision).toContain("<TodayDecisionLead");
    expect(decision).toContain("eventsPromise={eventsPromise}");
    expect(decision).not.toMatch(
      /<(?:OnNowBand|KeysScore|LocalSportsScoreboard|TomorrowPreview)\b/,
    );
  });

  it("renders the location-aware DaypartNeeds implementation once and removes its lower duplicate", () => {
    expect(todayPage.match(/<DaypartNeeds\b/g)).toHaveLength(1);
    expect(todayPage).not.toContain('label="Right now"');
  });

  it("keeps low-value repeated discovery rails off the briefing", () => {
    const disclosureStart = todayPage.indexOf('title="More for today"');
    const disclosureEnd = todayPage.indexOf(
      "</CollapsibleSection>",
      disclosureStart,
    );
    const disclosure = todayPage.slice(disclosureStart, disclosureEnd);

    expect(disclosureStart).toBeGreaterThan(-1);
    expect(disclosureEnd).toBeGreaterThan(disclosureStart);
    expect(disclosure).toContain("<TodayLocalGuidesWithSchedule");
    expect(disclosure).toContain("<FromYourSaved");
    expect(disclosure).toContain("<WeekendPreview");
    expect(disclosure).toContain("<PoolsToday");
    expect(disclosure).toContain("<MastheadNotes");
    expect(disclosure).not.toMatch(
      /<(?:CuratedPicks|WorthALook|TasteNudge|EmergencyPrompt|VisitorStayPrompt|PartnerAppsRow|ToolboxTeaser)\b/,
    );
  });

  it("uses the upper decision surface instead of repeating the Toolbox teaser", () => {
    expect(todayPage).toContain("<TodayAsk embedded");
    expect(todayPage).toContain("<BrowsePlacesDisclosure embedded");
    expect(todayPage).toContain("<CravingStrip");
    expect(todayPage).not.toContain("ToolboxTeaser");
  });
});
