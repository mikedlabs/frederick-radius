import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");
const globalCss = readFileSync("src/app/globals.css", "utf8");

describe("Today decision hierarchy", () => {
  const renderedPage = todayPage.slice(todayPage.indexOf("<EventSheetBoundary"));

  it("progressively enhances real event and place links without replacing their anchors", () => {
    const eventOpen = renderedPage.indexOf("<EventSheetBoundary fetchMissing");
    const placeOpen = renderedPage.indexOf("<PlaceSheetBoundary fetchMissing>");
    const placeClose = renderedPage.indexOf("</PlaceSheetBoundary>");
    const eventClose = renderedPage.indexOf("</EventSheetBoundary>");

    expect(todayPage).toContain(
      'import PlaceSheetBoundary from "@/components/place/PlaceSheetBoundary"',
    );
    expect(eventOpen).toBe(0);
    expect(placeOpen).toBeGreaterThan(eventOpen);
    expect(placeClose).toBeGreaterThan(placeOpen);
    expect(eventClose).toBeGreaterThan(placeClose);
  });

  it("keeps Find before supporting weather and the deeper place lead and event program", () => {
    const weather = renderedPage.indexOf("</SkyHero>");
    const lead = renderedPage.indexOf("{decisionLead}");
    const find = renderedPage.indexOf("<TodayAsk embedded");
    const events = renderedPage.indexOf("{whatsOn}");

    expect(weather).toBeGreaterThan(-1);
    expect(weather).toBeGreaterThan(find);
    expect(lead).toBeGreaterThan(find);
    expect(weather).toBeGreaterThan(lead);
    expect(events).toBeGreaterThan(lead);
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

  it("keeps alerts first, identifies Today, then gives the Fair one campaign slot", () => {
    const alerts = renderedPage.indexOf("<CivicAlerts />");
    const fair = renderedPage.indexOf("<TodayFairFeature");
    const masthead = renderedPage.indexOf("{frame.title}");
    const weather = renderedPage.indexOf("<SkyHero");

    expect(masthead).toBeGreaterThan(alerts);
    expect(fair).toBeGreaterThan(masthead);
    expect(fair).toBeGreaterThan(weather);
    expect(renderedPage).toContain("fairPromotionPhase ? (");
    expect(renderedPage).toContain(": civicMoment ? (");
    expect(renderedPage.match(/<TodayFairFeature\b/g)).toHaveLength(1);
  });

  it("puts In The Streets ahead of the ordinary briefing on its actual day", () => {
    const alerts = renderedPage.indexOf("<CivicAlerts />");
    const dayOfLead = renderedPage.indexOf("civicMomentLeadsToday && (");
    const masthead = renderedPage.indexOf("{frame.title}");

    expect(dayOfLead).toBeGreaterThan(alerts);
    expect(dayOfLead).toBeLessThan(masthead);
    expect(todayPage).toContain('civicMoment?.slug === "in-the-street-2026"');
    expect(todayPage).toContain("civicMoment.ends === easternDayKey(now)");
  });

  it("gives each part of the briefing one purpose and preserves an overlapping civic moment", () => {
    const decide = renderedPage.indexOf('className="today-start-grid"');
    const follow = renderedPage.indexOf('label="Follow the day"');
    const plan = renderedPage.indexOf('title="Plan the rest"');
    const more = renderedPage.indexOf('title="Local guides and saved places"');

    expect(decide).toBeGreaterThan(-1);
    expect(follow).toBeGreaterThan(decide);
    expect(plan).toBeGreaterThan(follow);
    expect(more).toBeGreaterThan(plan);
    expect(renderedPage).toContain(
      "civicMoment.slug !== TODAY_FAIR_PROMOTION_SLUG",
    );
    // Day-of In The Streets leads above the masthead; the existing Fair-aware
    // slots remain for pre-event weekends and overlapping occasions.
    expect(renderedPage.match(/<MomentSpotlight\b/g)).toHaveLength(3);
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
    expect(events).toContain("meta={todayEventPicksMeta({");
    expect(events).toContain("return <TodayEventsRecovery />;");
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

  it("hides the optional plan chapter when every time-gated child is empty", () => {
    expect(todayPage).toContain('title="Plan the rest"');
    expect(todayPage).toContain('storageKey="fr.today.plan-rest"');
    expect(todayPage).toContain(
      'className="today-plan-rest today-disclosure mt-8 border-t pt-2',
    );
    expect(globalCss).toContain(
      ".today-plan-rest:not(:has([data-today-plan-rest-content]))",
    );
    expect(todayPage).toContain("<WeatherSafeGoldenHour");
    expect(todayPage).toContain("<TomorrowPreview");
  });

  it("renders the location-aware DaypartNeeds implementation once and removes its lower duplicate", () => {
    expect(todayPage.match(/<DaypartNeeds\b/g)).toHaveLength(1);
    expect(todayPage).toContain(
      '<DaypartNeeds rows={rows} note={note} variant="brief" />',
    );
    expect(todayPage).not.toContain('label="Right now"');
  });

  it("keeps low-value repeated discovery rails off the briefing", () => {
    const disclosureStart = todayPage.indexOf(
      'title="Local guides and saved places"',
    );
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

  it("uses the upper decision surface instead of repeating the Toolbox teaser", () => {
    expect(todayPage).toContain("<TodayAsk embedded");
    expect(todayPage.match(/<TodayAsk embedded/g)).toHaveLength(1);
    expect(todayPage).not.toContain("<BrowsePlacesDisclosure");
    expect(todayPage).toContain("<CravingStrip");
    expect(todayPage).not.toContain("ToolboxTeaser");
  });
});
