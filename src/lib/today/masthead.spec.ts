import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import AERIAL_MANIFEST from "@/../public/images/seasons/aerial-manifest.json";
import SEASONS_MANIFEST from "@/../public/images/seasons/manifest.json";
import { daypartOfHour, type Daypart } from "@/lib/daypart";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";
import {
  DOWNTOWN_CAPTION_RADIUS_M,
  MASTHEAD_PHOTOS,
  archivePhotoCredit,
  archiveProvenance,
  mastheadWeatherPhrase,
  todayFrame,
  todayMastheadPhoto,
} from "./masthead";

const PARTS: Daypart[] = ["morning", "midday", "evening", "late"];

describe("todayFrame", () => {
  it("names each daypart from the one daypart clock", () => {
    expect(todayFrame("morning").title).toBe("This morning in Frederick County");
    expect(todayFrame("midday").title).toBe("Midday in Frederick County");
    expect(todayFrame("evening").title).toBe("Tonight in Frederick County");
    expect(todayFrame("late").title).toBe("Late in Frederick County");
  });

  it("flips at the same hours the place shelf and event program use", () => {
    // These boundaries used to be 12 and 17 here while the shelf and the
    // daypart module used 11 and 16, so the page named two moments at once.
    expect(todayFrame(daypartOfHour(10)).title).toBe("This morning in Frederick County");
    expect(todayFrame(daypartOfHour(11)).title).toBe("Midday in Frederick County");
    expect(todayFrame(daypartOfHour(15)).title).toBe("Midday in Frederick County");
    expect(todayFrame(daypartOfHour(16)).title).toBe("Tonight in Frederick County");
    expect(todayFrame(daypartOfHour(20)).title).toBe("Tonight in Frederick County");
    expect(todayFrame(daypartOfHour(21)).title).toBe("Late in Frederick County");
    expect(todayFrame(daypartOfHour(4)).title).toBe("Late in Frederick County");
    expect(todayFrame(daypartOfHour(5)).title).toBe("This morning in Frederick County");
  });

  it("gives every daypart a complete-sentence sub", () => {
    for (const part of PARTS) {
      const { sub } = todayFrame(part);
      expect(sub.endsWith(".")).toBe(true);
      expect(sub.length).toBeGreaterThan(12);
    }
  });
});

describe("todayMastheadPhoto", () => {
  const geotags = AERIAL_MANIFEST as Array<{ src: string; lat: number; lng: number; takenAt: string | null }>;
  const seasonal = Object.values(SEASONS_MANIFEST).filter(Array.isArray).flat() as Array<{
    src: string;
    width: number;
    height: number;
  }>;

  it("uses a real, landscape, geotagged downtown archive frame for every season and daypart", () => {
    for (const [season, slots] of Object.entries(MASTHEAD_PHOTOS)) {
      for (const part of PARTS) {
        const slot = slots[part as Daypart];
        expect(existsSync(join(process.cwd(), "public", slot.src)), `${season} ${part}`).toBe(true);
        const entry = seasonal.find((photo) => photo.src === slot.src);
        expect(entry, `${slot.src} is in the seasons manifest`).toBeDefined();
        // The band is about 2.2:1; a portrait frame would crop to a sliver.
        expect(entry!.width / entry!.height).toBeGreaterThanOrEqual(1.3);
        const tag = geotags.find((photo) => photo.src === slot.src);
        expect(tag?.takenAt, `${slot.src} has a capture time`).toBeTruthy();
        expect(
          haversineMeters(FREDERICK_CENTER, { lat: tag!.lat, lng: tag!.lng }),
        ).toBeLessThanOrEqual(DOWNTOWN_CAPTION_RADIUS_M);
      }
    }
  });

  it("follows the Eastern season and daypart instead of a fixed June frame", () => {
    // 10:53 PM Oct 6 (the audit render): late in fall, the downtown dusk frame.
    const lateFall = todayMastheadPhoto(new Date("2026-10-07T02:53:00.000Z"));
    expect(lateFall.src).toBe("/images/seasons/spring/Frederick Night.jpg");
    expect(lateFall.credit).toBe("Archive · Downtown Frederick · June 2019 · Mike D");
    expect(lateFall.alt).toBe(
      "Downtown Frederick from above at dusk in June 2019, photographed by Mike D.",
    );
    // 6:30 PM Oct 7: a fall evening gets the October 2024 color frame.
    const fallEvening = todayMastheadPhoto(new Date("2026-10-07T22:30:00.000Z"));
    expect(fallEvening.src).toBe("/images/seasons/fall/FALL COLORS.jpg");
    expect(fallEvening.credit).toBe("Archive · Downtown Frederick · October 2024 · Mike D");
    expect(fallEvening.season).toBe("fall");
    expect(fallEvening.daypart).toBe("evening");
    // Winter nights keep a winter frame.
    const winterLate = todayMastheadPhoto(new Date("2027-01-15T04:00:00.000Z"));
    expect(winterLate.season).toBe("winter");
    expect(winterLate.src).toBe("/images/seasons/winter/019.jpg");
    expect(winterLate.credit).toBe("Archive · Downtown Frederick · December 2021 · Mike D");
  });

  it("never captions a summer frame in another season", () => {
    for (const iso of [
      "2026-10-07T13:00:00.000Z",
      "2026-10-07T17:00:00.000Z",
      "2026-10-07T22:00:00.000Z",
    ]) {
      expect(todayMastheadPhoto(new Date(iso)).src).not.toContain("/summer/");
    }
  });
});

describe("archive credits", () => {
  it("derives place and month from the geotag and capture time", () => {
    expect(archiveProvenance("/images/seasons/summer/SUMMER CARROL CREEK.jpg")).toEqual({
      place: "Downtown Frederick",
      monthYear: "June 2023",
    });
  });

  it("leaves out a place the geotag cannot support", () => {
    // 4.3 km from downtown: dated, but not captioned as downtown.
    expect(archivePhotoCredit("/images/seasons/summer/056.jpg", "summer")).toBe(
      "Archive · May 2023 · Mike D",
    );
  });

  it("falls back to the season when the archive has no geotag", () => {
    expect(archivePhotoCredit("/images/seasons/summer/022.jpg", "summer")).toBe(
      "Archive · Summer · Mike D",
    );
    expect(archivePhotoCredit("/images/seasons/fall/not-in-archive.jpg", "fall")).toBe(
      "Archive · Fall · Mike D",
    );
  });
});

describe("mastheadWeatherPhrase", () => {
  it("writes the band's short current-conditions phrase", () => {
    expect(mastheadWeatherPhrase(48, "Clear")).toBe("48° and clear");
    expect(mastheadWeatherPhrase(61.6, "Mostly Cloudy")).toBe("62° and mostly cloudy");
    expect(mastheadWeatherPhrase(55, "Chance Rain Showers")).toBe("55° with a chance of rain");
    expect(mastheadWeatherPhrase(70, "Showers And Thunderstorms Likely")).toBe("70° with storms likely");
    expect(mastheadWeatherPhrase(33, "Light Snow")).toBe("33° and snowy");
    expect(mastheadWeatherPhrase(50, "Patchy Fog")).toBe("50° and foggy");
  });

  it("keeps the temperature alone for unknown phrasing and says nothing without a reading", () => {
    expect(mastheadWeatherPhrase(48, "Blowing Dust")).toBe("48°");
    expect(mastheadWeatherPhrase(null, "Clear")).toBeNull();
    expect(mastheadWeatherPhrase(undefined, undefined)).toBeNull();
  });
});
