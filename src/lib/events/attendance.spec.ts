import { describe, expect, it } from "vitest";
import {
  eventAttendanceLabel,
  eventAttendanceMode,
  eventOnlineActionUrl,
  hasActionableAttendance,
  hasRecommendationAttendance,
  hasPhysicalAttendance,
  isLikelyEventActionUrl,
} from "./attendance";

describe("event attendance semantics", () => {
  it("recognizes Frederick County's virtual and hybrid title conventions", () => {
    expect(eventAttendanceMode({ title: "Yoga for Mobility @ Virtual" })).toBe("online");
    expect(eventAttendanceMode({ title: "Strength & Stretch Thursdays @ Frederick & Virtual" })).toBe("mixed");
    expect(eventAttendanceMode({ title: "Strength & Stretch Thursdays (hybrid) @ Brunswick" })).toBe("mixed");
  });

  it("does not mistake a virtual-reality activity for an online event", () => {
    expect(eventAttendanceMode({ title: "Virtual Reality Game Night", venue_name: "FCPL" })).toBe("physical");
  });

  it("honors structured feed data before title inference", () => {
    expect(eventAttendanceMode({
      title: "Yoga @ Virtual",
      attendance_mode: "physical",
    })).toBe("physical");
  });

  it("separates direct event pages from generic feed URLs", () => {
    expect(isLikelyEventActionUrl("https://www.frederickcountymd.gov/Calendar.aspx?EID=15421")).toBe(true);
    expect(isLikelyEventActionUrl("https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml")).toBe(false);
    expect(isLikelyEventActionUrl("https://example.com/events/?ical=1")).toBe(false);
  });

  it("requires an actionable destination before an online-only event can lead", () => {
    const stranded = { title: "Online watercolor class" };
    const sourced = {
      ...stranded,
      source_url: "https://example.com/events/watercolor-class",
    };
    expect(hasActionableAttendance(stranded)).toBe(false);
    expect(hasActionableAttendance(sourced)).toBe(true);
    expect(eventOnlineActionUrl(sourced)).toBe(sourced.source_url);
  });

  it("keeps physical semantics and labels out of an online-only row", () => {
    const online = {
      title: "Yoga for Mobility @ Virtual",
      venue_name: "Frederick County",
    };
    expect(hasPhysicalAttendance(online)).toBe(false);
    expect(eventAttendanceLabel(online)).toBe("Online");
  });

  it("labels hybrid events without hiding their physical venue", () => {
    expect(eventAttendanceLabel({
      title: "Strength & Stretch (hybrid)",
      venue_name: "Brunswick Senior Center",
    })).toBe("Brunswick Senior Center · Online option");
  });
});

describe("recommendation attendance without calendar removal", () => {
  it.each(["Off Campus", " off-campus ", "OFF CAMPUS", "Frederick", "Frederick County", "TBD", ""])(
    "keeps physical %s browsable without promoting it", (venue_name) => {
      const listing = { title: "Published event", venue_name };
      expect(hasActionableAttendance(listing)).toBe(true);
      expect(hasRecommendationAttendance(listing)).toBe(false);
    },
  );

  it("accepts a named venue without requiring paid geocoding or exact coordinates", () => {
    const named = { title: "Concert", venue_name: "Sky Stage", geo_confidence: "area", geom: { lat: 39.4, lng: -77.4 } };
    expect(hasRecommendationAttendance(named)).toBe(true);
  });

  it("uses the real online attendance route rather than its physical placeholder", () => {
    const online = { attendance_mode: "online" as const, venue_name: "Off Campus", source_url: "https://example.test/calendar.ics" };
    expect(hasRecommendationAttendance(online)).toBe(false);
    expect(hasRecommendationAttendance({ ...online, rsvp_url: "https://example.test/events/register" })).toBe(true);
    expect(hasRecommendationAttendance({ ...online, ticket_url: "https://example.test/events/tickets" })).toBe(true);
    expect(hasRecommendationAttendance({ ...online, online_url: "javascript:alert(1)" })).toBe(false);
  });

  it("preserves Today's existing hybrid venue requirement", () => {
    expect(hasRecommendationAttendance({ title: "Concert (hybrid)", venue_name: "Off Campus", online_url: "https://example.test/join" })).toBe(false);
    expect(hasRecommendationAttendance({ title: "Concert (hybrid)", venue_name: "Community Hall" })).toBe(true);
  });
});
