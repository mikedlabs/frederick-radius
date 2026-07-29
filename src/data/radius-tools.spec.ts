import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FEATURED_RADIUS_TOOLS,
  RADIUS_TOOL_GROUPS,
  RADIUS_TOOLS,
  radiusJourneyForPath,
} from "./radius-tools";
import { APP_PAGES } from "./app-pages";
import { AMENITY_GROUPS } from "@/components/map/constants";

const SPECIAL_ROUTE_FILES: Record<string, string> = {
  "/events": "src/app/(app)/events/(list)/page.tsx",
  "/events/calendar": "src/app/(app)/events/(list)/calendar/page.tsx",
  "/report": "src/app/report/page.tsx",
  "/submit/event": "src/app/submit/event/page.tsx",
  "/submit/place": "src/app/submit/place/page.tsx",
  // From Above lives outside the (app) route group so the full-bleed book
  // experience runs without the app chrome.
  "/from-above/preview": "src/app/from-above/preview/page.tsx",
};

function routeFile(href: string): string {
  const pathname = new URL(href, "https://frederickradius.app").pathname;
  return (
    SPECIAL_ROUTE_FILES[pathname] ?? `src/app/(app)${pathname}/page.tsx`
  );
}

describe("Radius tool registry", () => {
  it("keeps group ids, tool ids, and destinations unique", () => {
    const groupIds = RADIUS_TOOL_GROUPS.map((group) => group.id);
    const toolIds = RADIUS_TOOLS.map((tool) => tool.id);
    const destinations = RADIUS_TOOLS.map((tool) => tool.href);

    expect(new Set(groupIds).size).toBe(groupIds.length);
    expect(new Set(toolIds).size).toBe(toolIds.length);
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it("assigns secondary tools to a stable primary journey", () => {
    expect(radiusJourneyForPath("/beer")).toBe("today");
    expect(radiusJourneyForPath("/pulse")).toBe("today");
    expect(radiusJourneyForPath("/access")).toBe("today");
    expect(radiusJourneyForPath("/signals")).toBe("today");
    expect(radiusJourneyForPath("/parks")).toBe("map");
    expect(radiusJourneyForPath("/amenities")).toBe("map");
    expect(radiusJourneyForPath("/sports")).toBe("events");
    expect(radiusJourneyForPath("/settings")).toBe("saved");
    expect(radiusJourneyForPath("/search")).toBeNull();
  });

  it("only exposes working internal tool routes", () => {
    for (const tool of RADIUS_TOOLS) {
      expect(tool.href).toMatch(/^\//);
      expect(tool.href).not.toMatch(
        /^\/(?:admin(?:\/|$)|collect(?:\/|$)|proto(?:\/|$)|business\/claim(?:\/|$)|from-above\/time-machine(?:\/|$))/,
      );
      expect(existsSync(join(process.cwd(), routeFile(tool.href)))).toBe(true);
    }
  });

  it("covers every shipped decision and public-amenity tool", () => {
    const ids = new Set(RADIUS_TOOLS.map((tool) => tool.id));

    for (const id of [
      "county-pulse",
      "communication-access",
      "open-now",
      "nearby",
      "public-essentials",
      "plan",
      "events",
      "event-calendar",
      "check-a-date",
      "reserve",
      "county-map",
      "parking",
      "transit",
      "contacts",
      "shipping",
      "search",
      "restrooms",
      "water",
      "trash-cans",
      "dog-stations",
      "public-wifi",
      "ev-charging",
      "power-outlets",
      "bike-racks",
      "seating",
      "play-areas",
      "brunch",
      "happy-hour",
      "deals",
      "food-trucks",
      "live-music",
      "places",
      "towns",
      "parks",
      "trails",
      "markers",
      "history",
      "nonprofits",
      "collections",
      "saved",
      "notifications",
      "rivers",
      "overhead",
      "beer-tools",
      "archive",
      "mark-a-spot",
      "add-event",
      "add-place",
    ]) {
      expect(ids.has(id), `missing Radius tool: ${id}`).toBe(true);
    }
  });

  it("keeps every searchable app guide reachable from the toolbox", () => {
    const toolPaths = new Set(
      RADIUS_TOOLS.map(
        (tool) => new URL(tool.href, "https://frederickradius.app").pathname,
      ),
    );
    const exclusions = new Set(["/ask"]);
    const missing = APP_PAGES.filter(
      (page) => !exclusions.has(page.href) && !toolPaths.has(page.href),
    ).map((page) => page.href);

    expect(missing).toEqual([]);
  });

  it("keeps map filters and hash destinations valid", () => {
    const amenityKeys = new Set(AMENITY_GROUPS.map((group) => group.key));

    for (const tool of RADIUS_TOOLS) {
      const url = new URL(tool.href, "https://frederickradius.app");
      if (url.pathname === "/map") {
        const amenities = (url.searchParams.get("amenity") ?? "")
          .split(",")
          .filter(Boolean);
        for (const amenity of amenities) expect(amenityKeys.has(amenity)).toBe(true);
        if (url.searchParams.has("in")) {
          expect(url.searchParams.get("in")).toBe("county");
        }
      }

      if (url.hash) {
        expect(tool.href).toBe("/beer#find-your-pour");
        const beerFinder = readFileSync(
          join(process.cwd(), "src/components/beer/BeerSpinner.tsx"),
          "utf8",
        );
        expect(beerFinder).toContain(`id="${url.hash.slice(1)}"`);
      }
    }
  });

  it("keeps the first screen focused and the capability copy complete", () => {
    expect(FEATURED_RADIUS_TOOLS).toHaveLength(6);
    for (const tool of RADIUS_TOOLS) {
      expect(tool.description).toMatch(/[.!?]$/);
    }
  });
});
