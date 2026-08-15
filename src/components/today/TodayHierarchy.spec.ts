import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");

describe("Today decision hierarchy", () => {
  const renderedPage = todayPage.slice(todayPage.indexOf("<EventSheetBoundary"));

  it("puts the ranked place and event content before the compact Ask and Browse escape row", () => {
    const weather = renderedPage.indexOf("</SkyHero>");
    const lead = renderedPage.indexOf("{decisionLead}");
    const events = renderedPage.indexOf("{whatsOn}");
    const escape = renderedPage.indexOf('id="today-more-help-heading"');
    const ask = renderedPage.indexOf('href="/ask"', escape);
    const browse = renderedPage.indexOf(
      'aria-label="Browse nearby places by category"',
      escape,
    );

    expect(weather).toBeGreaterThan(-1);
    expect(lead).toBeGreaterThan(weather);
    expect(events).toBeGreaterThan(lead);
    expect(escape).toBeGreaterThan(events);
    expect(ask).toBeGreaterThan(escape);
    expect(browse).toBeGreaterThan(ask);
  });

  it("shows an honest live scope readout before weather on narrow screens", () => {
    const title = renderedPage.indexOf("{frame.title}");
    // Matched loosely: the component now carries the dateline as a prop, and
    // this test guards ORDER (title, then scope line, then weather), not the
    // element's exact attribute list.
    const scope = renderedPage.indexOf("<TodayScopeStatus");
    const weather = renderedPage.indexOf("<SkyHero");

    expect(title).toBeGreaterThan(-1);
    expect(scope).toBeGreaterThan(title);
    expect(weather).toBeGreaterThan(scope);
  });

  it("does not stack a second weather-safety panel below the active alert", () => {
    expect(renderedPage).toContain("<CivicAlerts />");
    expect(renderedPage).not.toContain("<WeatherNeeds");
  });

  it("keeps the town-aware place answer mounted instead of replacing it with an event", () => {
    const decisionStart = todayPage.indexOf("const decisionLead =");
    const decisionEnd = todayPage.indexOf(
      "const availableToday =",
      decisionStart,
    );
    const decision = todayPage.slice(decisionStart, decisionEnd);

    expect(decision).toContain(
      "fallback={<OpenPlaceLead rows={baseDaypartRows} note={null} />}",
    );
    expect(decision).toContain("<WeatherAwareOpenPlaceLead");
    expect(decision).not.toContain("<TodayDecisionLead");
    expect(decision).not.toContain("eventsPromise={eventsPromise}");
    expect(decision).not.toMatch(
      /<(?:OnNowBand|KeysScore|LocalSportsScoreboard|TomorrowPreview)\b/,
    );
  });

  it("keeps the optional event feature inside the countywide event program", () => {
    const eventsStart = todayPage.indexOf("async function WhatsOn");
    const events = todayPage.slice(eventsStart);

    expect(eventsStart).toBeGreaterThan(-1);
    expect(events).toContain("featureIsPromoted && feature ?");
    expect(events).toContain("<TonightHeadline event={feature} now={now} embedded />");
    expect(events).toContain("Countywide");
    expect(events).toContain("return null;");
    expect(events).not.toContain("Some event sources are still updating.");
  });

  it("puts current utilities before the broader sports board", () => {
    const availableStart = todayPage.indexOf("const availableToday =");
    const availableEnd = todayPage.indexOf("const whatsOn =", availableStart);
    const available = todayPage.slice(availableStart, availableEnd);

    expect(available.indexOf("<OnNowBand")).toBeGreaterThan(-1);
    expect(available.indexOf("<KeysScore")).toBeGreaterThan(
      available.indexOf("<OnNowBand"),
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
    expect(disclosure).toContain("<TodayLocalGuides");
    expect(disclosure).toContain("fallback={<TodayFoodTruckGuide />}");
    expect(disclosure).toContain("<TodayFoodTruckGuideWithSchedule");
    expect(disclosure).toContain("<FromYourSaved");
    expect(disclosure).toContain("<WeekendPreview");
    expect(disclosure).toContain("<PoolsToday");
    expect(disclosure).toContain("<MastheadNotes");
    expect(disclosure).not.toMatch(
      /<(?:CuratedPicks|WorthALook|TasteNudge|EmergencyPrompt|VisitorStayPrompt|PartnerAppsRow|ToolboxTeaser)\b/,
    );
  });

  it("uses one compact Ask and Browse row instead of stacked discovery systems", () => {
    expect(todayPage).toContain("Need something else?");
    expect(todayPage).toContain('href="/ask"');
    expect(todayPage).toContain('aria-label="Browse nearby places by category"');
    expect(todayPage).not.toContain("<TodayAsk");
    expect(todayPage).not.toContain("<BrowsePlacesDisclosure");
    expect(todayPage).toContain("<CravingStrip");
    expect(todayPage).not.toContain("ToolboxTeaser");
  });
});
