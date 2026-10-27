import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayGeographicDoorwayView } from "./TodayGeographicDoorway";

const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");
const todayAsk = readFileSync("src/components/today/TodayAsk.tsx", "utf8");
const todayMasthead = readFileSync("src/components/today/TodayMasthead.tsx", "utf8");
const geographicDoorway = readFileSync("src/components/today/TodayGeographicDoorway.tsx", "utf8");
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

  it("puts the single weather glance before Find and the place and event answers", () => {
    const weather = renderedPage.indexOf("<TodayMasthead");
    const lead = renderedPage.indexOf("{decisionLead}");
    const find = renderedPage.indexOf("<TodayAsk embedded");
    const events = renderedPage.indexOf("{whatsOn}");

    expect(weather).toBeGreaterThan(-1);
    expect(renderedPage.match(/<TodayMasthead\b/g)).toHaveLength(1);
    expect(todayMasthead.match(/<section data-today-weather/g)).toHaveLength(1);
    expect(renderedPage.match(/<TodayCard density="masthead"\s*\//g)).toHaveLength(1);
    expect(find).toBeGreaterThan(-1);
    expect(find).toBeGreaterThan(weather);
    expect(lead).toBeGreaterThan(find);
    expect(lead).toBeGreaterThan(weather);
    expect(events).toBeGreaterThan(find);
    expect(events).toBeLessThan(lead);
    expect(events).toBeGreaterThan(weather);
  });

  it("lets the owned scene and current local answers lead one utility deck after news", () => {
    const find = renderedPage.indexOf("<TodayAsk embedded showQuickNeeds={false}");
    const doorway = renderedPage.indexOf("<TodayGeographicDoorway />");
    const lead = renderedPage.indexOf("{decisionLead}");
    const events = renderedPage.indexOf("{whatsOn}");
    const news = renderedPage.indexOf("<LocalNewsBrief");
    const explore = renderedPage.indexOf('aria-labelledby="today-explore-heading"');
    const shortcuts = renderedPage.indexOf("<TodayQuickNeeds><CravingStrip /></TodayQuickNeeds>");

    expect(find).toBeGreaterThan(-1);
    expect(doorway).toBeGreaterThan(find);
    expect(lead).toBeGreaterThan(find);
    expect(doorway).toBeLessThan(shortcuts);
    expect(doorway).toBeLessThan(events);
    expect(doorway).toBeLessThan(lead);
    expect(events).toBeGreaterThan(find);
    expect(events).toBeLessThan(lead);
    expect(news).toBeGreaterThan(lead);
    expect(explore).toBeGreaterThan(news);
    expect(shortcuts).toBeGreaterThan(explore);
    expect(renderedPage.match(/<TodayQuickNeeds\b/g)).toHaveLength(1);
    expect(renderedPage.slice(explore, renderedPage.indexOf("</section>", explore))).toContain(
      "<TodayQuickNeeds><CravingStrip /></TodayQuickNeeds>",
    );
    expect(renderedPage.match(/<CravingStrip\b/g)).toHaveLength(1);

    const utilityDoors = todayAsk.slice(todayAsk.indexOf("export function TodayQuickNeeds"));
    expect(utilityDoors).toContain("showShortcuts = true");
    expect(utilityDoors).toContain("{showShortcuts ? <div");
    expect(utilityDoors.match(/<Link\b/g)).toHaveLength(4);
    for (const href of ["/open-now", "/amenities", "/contacts"]) {
      expect(utilityDoors).toContain(`href="${href}"`);
    }
    expect(utilityDoors).toContain("href={planHref}");
    expect(utilityDoors).toContain('encodeURIComponent("Plan the next two hours")');
    expect(utilityDoors).toContain("scopeToParam(scope)");
    for (const label of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      expect(utilityDoors.split(label)).toHaveLength(2);
    }
    expect(utilityDoors).toContain("<BrowsePlacesDisclosure embedded>{children}</BrowsePlacesDisclosure>");
  });

  it("keeps the heading independent of streamed weather and the scope readout before local choices", () => {
    const title = todayMasthead.indexOf("<h1");
    const weather = todayMasthead.indexOf("<section data-today-weather");
    const find = renderedPage.indexOf("<TodayAsk embedded");
    const scope = renderedPage.indexOf("<TodayScopeStatus");
    const doorway = renderedPage.indexOf("<TodayGeographicDoorway />");

    expect(title).toBeGreaterThan(-1);
    expect(weather).toBeGreaterThan(title);
    expect(todayMasthead).not.toContain("<Suspense");
    expect(renderedPage).toContain("weather={\n          <Suspense");
    expect(scope).toBeGreaterThan(find);
    expect(doorway).toBeGreaterThan(scope);
  });

  it("uses exact local scenes and scoped task links without promoting unreviewed merchants", () => {
    const photos = renderToStaticMarkup(createElement(TodayGeographicDoorwayView));
    expect(photos).toContain(encodeURIComponent("/images/places/carillon-sunset.jpg"));
    expect(photos).toContain(encodeURIComponent("/images/seasons/spring/010.jpg"));
    expect(photos.match(/data-today-geographic-place=/g)).toHaveLength(2);
    for (const category of ["food", "outside"]) {
      expect(photos).toContain(`href="/nearby?c=${category}&amp;in=county&amp;returnTo=%2Ftoday%3Fin%3Dcounty"`);
    }
    expect(photos).not.toMatch(/Find pizza|pizza-preparation|Zoe|Sabor|api\/place-photo/);
    for (const scope of ["town:mount-airy", "nearme"] as const) {
      const scoped = renderToStaticMarkup(createElement(TodayGeographicDoorwayView, { scope }));
      expect(scoped).not.toContain("data-today-geographic-place");
      expect(scoped).not.toContain("<img");
      expect(scoped.match(/data-today-discovery-action=/g)).toHaveLength(2);
      expect(scoped).toContain(`in=${scope === "nearme" ? "nearme" : "mount-airy"}`);
    }
    expect(geographicDoorway).not.toContain("useTodayPlacePhoto");
    expect(todayMasthead).not.toContain("<Image");
    expect(renderedPage.match(/\{decisionLead\}/g)).toHaveLength(1);
    expect(renderedPage).toContain("fallback={<TodayGeographicDoorwayPending />}");
    expect(renderedPage).not.toContain("fallback={<TodayGeographicDoorwayView");
    expect(renderedPage.indexOf("<TodayGeographicDoorway />")).toBeLessThan(renderedPage.indexOf("{decisionLead}"));
    const placeAnswer = renderedPage.slice(
      renderedPage.indexOf('<div aria-label="Places for your area"'),
      renderedPage.indexOf("<LocalNewsBrief"),
    );
    expect(placeAnswer).toContain("{decisionLead}");
    expect(placeAnswer).not.toContain("<TodayGeographicDoorway");
    expect(renderedPage.indexOf("<TodayPlanTonightLink")).toBeGreaterThan(renderedPage.indexOf("<TodayAsk embedded"));
    expect(renderedPage.match(/<TodayPlanTonightLink/g)).toHaveLength(1);
  });

  it("does not stack a second weather-safety panel below the active alert", () => {
    expect(renderedPage).toContain("<CivicAlerts compact />");
    expect(renderedPage).not.toContain("<WeatherNeeds");
  });

  it("keeps alerts first and the request doorway ahead of the one Fair campaign slot", () => {
    const alerts = renderedPage.indexOf("<CivicAlerts compact />");
    const fair = renderedPage.indexOf("<TodayFairFeature");
    const masthead = renderedPage.indexOf("<TodayMasthead");
    const find = renderedPage.indexOf("<TodayAsk embedded");
    const weather = renderedPage.indexOf('<TodayCard density="masthead"');

    expect(masthead).toBeGreaterThan(alerts);
    expect(find).toBeGreaterThan(masthead);
    expect(fair).toBeGreaterThan(renderedPage.indexOf("{whatsOn}"));
    expect(renderedPage).toContain("<TodayPlanTonightLink />");
    expect(weather).toBeLessThan(find);
    expect(weather).toBeLessThan(fair);
    expect(renderedPage).toContain("fairPromotionPhase ? (");
    expect(renderedPage).toContain(": civicMoment ? (");
    expect(renderedPage.match(/<TodayFairFeature\b/g)).toHaveLength(1);
    expect(todayPage).toContain('from "@/components/today/TodayFairFeatureIsland"');
    expect(todayPage).not.toContain('from "@/components/today/TodayFairFeature"');
  });

  it("puts In The Streets ahead of the ordinary briefing on its actual day", () => {
    const alerts = renderedPage.indexOf("<CivicAlerts compact />");
    const dayOfLead = renderedPage.indexOf("civicMomentLeadsToday && (");
    const masthead = renderedPage.indexOf("<TodayMasthead");

    expect(dayOfLead).toBeGreaterThan(alerts);
    expect(dayOfLead).toBeLessThan(masthead);
    expect(todayPage).toContain('civicMoment?.slug === "in-the-street-2026"');
    expect(todayPage).toContain("civicMoment.ends === easternDayKey(now)");
  });

  it("gives each part of the briefing one purpose and preserves an overlapping civic moment", () => {
    const decide = renderedPage.indexOf("data-today-briefing");
    const follow = renderedPage.indexOf("data-today-events");
    const plan = renderedPage.indexOf('title="Plan the rest"');
    const more = renderedPage.indexOf('title="Local guides and saved places"');

    expect(decide).toBeGreaterThan(-1);
    expect(follow).toBeGreaterThan(decide);
    expect(renderedPage).not.toContain('label="Follow the day"');
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

  it("uses the same scoped visual shortlist for server paint and recovery", () => {
    const eventsStart = todayPage.indexOf("async function WhatsOn");
    const events = todayPage.slice(eventsStart);

    expect(eventsStart).toBeGreaterThan(-1);
    expect(events).toContain("selectTodayEvents(snapshot.publicEvents, now, 4");
    expect(events).toContain('venuePhotos: "free-reviewed"');
    expect(events).toContain("initialResponse={initialResponse} scoped");
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
    expect(disclosure).toContain("fallback={<TodayFoodTruckGuide foodTruckCount={FOOD_TRUCKS.length} />}");
    expect(disclosure).toContain("breweryCount={BREWERIES.length}");
    expect(disclosure).toContain("foodTruckCount={FOOD_TRUCKS.length}");
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
