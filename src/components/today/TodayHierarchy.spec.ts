import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");
const globalCss = readFileSync("src/app/globals.css", "utf8");
const layoutCss = readFileSync("src/components/today/TodayLayout.module.css", "utf8");

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

  it("puts Find and useful place and event answers before secondary weather", () => {
    const weather = renderedPage.indexOf("<section data-today-weather");
    const lead = renderedPage.indexOf("{decisionLead}");
    const find = renderedPage.indexOf("<TodayAsk embedded");
    const events = renderedPage.indexOf("{whatsOn}");

    expect(weather).toBeGreaterThan(-1);
    expect(find).toBeGreaterThan(-1);
    expect(find).toBeLessThan(weather);
    expect(lead).toBeGreaterThan(find);
    expect(lead).toBeLessThan(weather);
    expect(events).toBeGreaterThan(lead);
    expect(events).toBeLessThan(weather);
  });

  it("shows an honest live scope readout before weather on narrow screens", () => {
    const title = renderedPage.indexOf("{frame.title}");
    // Matched loosely: the component now carries the dateline as a prop, and
    // this test guards ORDER (title, then scope line, then weather), not the
    // element's exact attribute list.
    const scope = renderedPage.indexOf("<TodayScopeStatus");
    const weather = renderedPage.indexOf("<section data-today-weather");

    expect(title).toBeGreaterThan(-1);
    expect(scope).toBeGreaterThan(title);
    expect(weather).toBeGreaterThan(scope);
  });

  it("keeps the archive photograph distinct from current facts and preserves Tonight below Find", () => {
    const mastheadEnd = renderedPage.indexOf("</header>");
    const masthead = renderedPage.slice(0, mastheadEnd);
    // The frame follows the Eastern season and daypart; its credit and alt
    // text come from the archive's own geotag, never a hardcoded June frame.
    expect(masthead).toContain("const photo = todayMastheadPhoto(now);");
    expect(masthead).toContain("src={photo.src}");
    expect(masthead).toContain("alt={photo.alt}");
    expect(masthead).toContain("{photo.credit}</figcaption>");
    expect(masthead).not.toContain("SUMMER CARROL CREEK");
    expect(masthead).not.toContain("<TodayPlanTonightLink");
    expect(renderedPage.indexOf("<TodayPlanTonightLink")).toBeGreaterThan(
      renderedPage.indexOf("<TodayAsk embedded"),
    );
    expect(renderedPage.match(/<TodayPlanTonightLink/g)).toHaveLength(1);
  });

  it("does not stack a second weather-safety panel below the active alert", () => {
    expect(renderedPage).toContain("<CivicAlerts compact />");
    expect(renderedPage).not.toContain("<WeatherNeeds");
  });

  it("keeps alerts first and the request doorway ahead of the one Fair campaign slot", () => {
    const alerts = renderedPage.indexOf("<CivicAlerts compact />");
    const fair = renderedPage.indexOf("<TodayFairFeature");
    const masthead = renderedPage.indexOf("{frame.title}");
    const find = renderedPage.indexOf("<TodayAsk embedded");
    const weather = renderedPage.indexOf("<section data-today-weather");

    expect(masthead).toBeGreaterThan(alerts);
    expect(find).toBeGreaterThan(masthead);
    expect(fair).toBeGreaterThan(renderedPage.indexOf("{whatsOn}"));
    expect(renderedPage).toContain(
      "<TodayPlanTonightLink renderedAt={now.toISOString()} />",
    );
    expect(weather).toBeGreaterThan(fair);
    expect(renderedPage).toContain("fairPromotionPhase ? (");
    expect(renderedPage).toContain(": civicMoment ? (");
    expect(renderedPage.match(/<TodayFairFeature\b/g)).toHaveLength(1);
  });

  it("puts In The Streets ahead of the ordinary briefing on its actual day", () => {
    const alerts = renderedPage.indexOf("<CivicAlerts compact />");
    const dayOfLead = renderedPage.indexOf("civicMomentLeadsToday && (");
    const masthead = renderedPage.indexOf("{frame.title}");

    expect(dayOfLead).toBeGreaterThan(alerts);
    expect(dayOfLead).toBeLessThan(masthead);
    expect(todayPage).toContain('civicMoment?.slug === "in-the-street-2026"');
    expect(todayPage).toContain("civicMoment.ends === easternDayKey(now)");
  });

  it("gives each part of the briefing one purpose and preserves an overlapping civic moment", () => {
    const decide = renderedPage.indexOf("data-today-briefing");
    // The events chapter is named by the daypart clock (dayProgramLabel).
    const follow = renderedPage.indexOf("label={dayProgramLabel(now)}");
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
    // The chapter heading names the section; partial coverage is one sentence
    // and the board is one link under the rows.
    expect(events).toContain("Some calendars did not load, so this list may be missing events.");
    expect(events).toContain("data-today-program-all");
    // The recovery note still stands in for a degraded empty program; after
    // 9 PM the coming day's rows may follow it.
    expect(events).toMatch(/return \(\s*<>\s*<TodayEventsRecovery(?: headed=\{false\})? \/>\s*\{comingDayAnswer\}/);
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
  });

  it("puts the dateline and current weather on the photo band, not in a row below it", () => {
    const mastheadEnd = renderedPage.indexOf("</header>");
    const masthead = renderedPage.slice(0, mastheadEnd);
    const title = masthead.indexOf("{frame.title}");
    const dateline = masthead.indexOf("data-today-dateline");
    const figure = masthead.indexOf("<figure");
    const scope = masthead.indexOf("<TodayScopeStatus");

    expect(masthead).toContain("const frame = todayFrame(daypart(now));");
    expect(dateline).toBeGreaterThan(title);
    expect(figure).toBeGreaterThan(dateline);
    expect(scope).toBeGreaterThan(figure);
    expect(masthead).toContain("{formatEasternDateline(now)}");
    expect(masthead).toContain("<MastheadWeather forecastPromise={forecastForLean} />");
    // The scope line no longer carries the date a second time.
    expect(masthead).toContain("<TodayScopeStatus />");
    // Owner decision (PR #1734): the band stays 160px tall on phones.
    expect(layoutCss).toMatch(/\.mastheadLead \{[^}]*min-height: 160px;/);
    expect(layoutCss).toMatch(/\.dateline \{[^}]*padding: 6px 16px 40px;/);
  });

  it("answers late at night outside the Plan the rest disclosure", () => {
    const planStart = renderedPage.indexOf('title="Plan the rest"');
    const planEnd = renderedPage.indexOf("</CollapsibleSection>", planStart);
    const plan = renderedPage.slice(planStart, planEnd);
    const whatsOn = todayPage.slice(todayPage.indexOf("async function WhatsOn"));

    // Tomorrow's rows used to sit inside the collapsed chapter at 10:53 PM.
    expect(plan).not.toContain("<TomorrowPreview");
    expect(whatsOn).toContain("const late = isTomorrowPreviewTime(now);");
    expect(whatsOn).toContain("selectComingDayEvents(publicEvents, now)");
    expect(whatsOn).toContain("comingDayWeatherSentence(await forecastPromise, now)");
    expect(whatsOn).toContain("<TomorrowPreview");
    expect(whatsOn).toContain("<ProgramRow");
    // What is still on tonight leads; the coming day follows it.
    expect(whatsOn.lastIndexOf("data-today-program ")).toBeGreaterThan(-1);
    expect(whatsOn.lastIndexOf("data-today-program ")).toBeLessThan(
      whatsOn.lastIndexOf("{comingDayAnswer}"),
    );
    // With nothing still on, the coming day leads with its own pin map.
    expect(whatsOn).toContain("comingDayAnswerWith(true)");
    // After 9 PM nothing is listed under "Earlier today".
    expect(todayPage).toContain("const ended = late ? [] :");
    expect(todayPage).toContain("isStillOnTonight(e, now, tonightEnds)");
  });

  it("names program groups from the one daypart clock", () => {
    const whatsOn = todayPage.slice(todayPage.indexOf("async function WhatsOn"));
    expect(whatsOn).toContain("programDaypartLabel(easternStartHour(row.e.starts_at))");
    expect(whatsOn).not.toMatch(/"This afternoon"/);
    expect(whatsOn).not.toMatch(/>=\s*17/);
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
    expect(todayPage).toContain("<CravingStrip");
    expect(todayPage).not.toContain("ToolboxTeaser");
  });

  it("puts the category index after the place answers, not between Find and them", () => {
    const find = renderedPage.indexOf("<TodayAsk embedded />");
    const lead = renderedPage.indexOf("{decisionLead}");
    const browse = renderedPage.indexOf("<BrowsePlacesDisclosure>");
    const events = renderedPage.indexOf("{whatsOn}");

    expect(find).toBeGreaterThan(-1);
    expect(lead).toBeGreaterThan(find);
    expect(browse).toBeGreaterThan(lead);
    expect(browse).toBeLessThan(events);
    expect(renderedPage.match(/<BrowsePlacesDisclosure\b/g)).toHaveLength(1);
    expect(renderedPage.slice(browse, renderedPage.indexOf("</BrowsePlacesDisclosure>")))
      .toContain("<CravingStrip />");
  });
});
