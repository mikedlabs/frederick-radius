import { describe, expect, it } from "vitest";
import {
  eventAttendanceMode,
  eventOnlineActionUrl,
  type EventAttendanceInput,
} from "@/lib/events/attendance";
import {
  eventMobilePrimaryAction,
  isEventDirectionsWindow,
} from "./eventActionBar";

/** Resolve the bar the same way the event page does. */
function primaryFor(event: EventAttendanceInput) {
  return eventMobilePrimaryAction({
    ticketUrl: event.ticket_url,
    attendance: eventAttendanceMode(event),
    onlineActionUrl: eventOnlineActionUrl(event),
  });
}

describe("eventMobilePrimaryAction", () => {
  it("leads an in-person event without tickets with Add to calendar", () => {
    // eventOnlineActionUrl falls back to the source page, so this event has
    // an "online action URL" even though nobody attends it online. The bar
    // used to make Add to calendar quiet here and show no primary at all.
    const event = {
      title: "Bluegrass Jam",
      venue_name: "Steinhardt Brewing Company",
      source_url: "https://steinhardtbrewing.com/events/bluegrass-jam",
    };

    expect(eventOnlineActionUrl(event)).not.toBeNull();
    expect(primaryFor(event)).toBe("calendar");
  });

  it("leads with Tickets whenever the event sells them", () => {
    expect(
      primaryFor({
        title: "Fall concert",
        venue_name: "Weinberg Center",
        ticket_url: "https://weinbergcenter.org/tickets/fall",
      }),
    ).toBe("tickets");
    expect(
      primaryFor({
        title: "Virtual author talk",
        attendance_mode: "online",
        ticket_url: "https://example.org/tickets",
        online_url: "https://example.org/join",
      }),
    ).toBe("tickets");
  });

  it.each(["online", "mixed"] as const)(
    "leads a %s event without tickets with its online details",
    (attendance_mode) => {
      expect(
        primaryFor({
          title: "Library book club",
          attendance_mode,
          online_url: "https://fcpl.org/join",
        }),
      ).toBe("online");
    },
  );

  it("falls back to Add to calendar for an online event with nowhere to go", () => {
    expect(
      primaryFor({ title: "Online class", attendance_mode: "online" }),
    ).toBe("calendar");
  });

  it("never leads with Directions without a clock, even for a routable venue", () => {
    expect(
      eventMobilePrimaryAction({
        ticketUrl: "https://t.example/1",
        attendance: "physical",
        hasDirections: true,
        startsAt: "2026-10-06T19:00:00-04:00",
      }),
    ).toBe("tickets");
  });

  it("names exactly one primary for every combination", () => {
    const results = new Set<string>();
    for (const ticketUrl of [null, "https://t.example/1"]) {
      for (const attendance of ["physical", "online", "mixed"] as const) {
        for (const onlineActionUrl of [null, "https://o.example/1"]) {
          const primary = eventMobilePrimaryAction({
            ticketUrl,
            attendance,
            onlineActionUrl,
          });
          // The page fills Add to calendar only for "calendar", Tickets only
          // for "tickets", Online details only for "online": one each time.
          const filled = [
            primary === "calendar",
            primary === "tickets" && Boolean(ticketUrl),
            primary === "online" && Boolean(onlineActionUrl),
          ].filter(Boolean);
          expect(filled).toHaveLength(1);
          results.add(primary);
        }
      }
    }
    expect(results).toEqual(new Set(["calendar", "tickets", "online"]));
  });
});

/**
 * A 7:30 PM show at a precisely located venue that sells tickets. Every clock
 * below is Eastern (October is EDT, UTC-4).
 */
const show = {
  ticketUrl: "https://weinbergcenter.org/tickets/fall",
  attendance: "physical" as const,
  onlineActionUrl: "https://weinbergcenter.org/fall",
  startsAt: "2026-10-08T19:30:00-04:00",
  endsAt: "2026-10-08T22:00:00-04:00",
  hasDirections: true,
};

function showAt(now: string, overrides: Partial<Parameters<typeof eventMobilePrimaryAction>[0]> = {}) {
  return eventMobilePrimaryAction({ ...show, now: new Date(now), ...overrides });
}

/** Catoctin Colorfest: Sat Oct 10 9 AM to Sun Oct 11 5 PM, free, no tickets. */
const colorfest = {
  attendance: "physical" as const,
  onlineActionUrl: "https://www.thurmont.com/2236/Colorfest",
  startsAt: "2026-10-10T09:00:00-04:00",
  endsAt: "2026-10-11T17:00:00-04:00",
  hasDirections: true,
};

function colorfestAt(now: string) {
  return eventMobilePrimaryAction({ ...colorfest, now: new Date(now) });
}

describe("Directions lead on the way to an in-person event", () => {
  it("keeps Tickets primary the day before", () => {
    expect(showAt("2026-10-07T19:30:00-04:00")).toBe("tickets");
  });

  it("keeps Tickets primary at 3 hours and 1 minute before the start", () => {
    expect(showAt("2026-10-08T16:29:00-04:00")).toBe("tickets");
  });

  it("switches to Directions at 2 hours and 59 minutes before the start", () => {
    expect(showAt("2026-10-08T16:31:00-04:00")).toBe("directions");
  });

  it("opens the window exactly 3 hours before the start", () => {
    expect(showAt("2026-10-08T16:30:00-04:00")).toBe("directions");
  });

  it("leads with Directions while the event is on", () => {
    expect(showAt("2026-10-08T20:45:00-04:00")).toBe("directions");
  });

  it("returns to the usual rule after the end", () => {
    expect(showAt("2026-10-08T22:00:00-04:00")).toBe("tickets");
    expect(showAt("2026-10-08T23:30:00-04:00")).toBe("tickets");
  });

  it("gives a show with no listed end a 3-hour runtime", () => {
    expect(showAt("2026-10-08T22:29:00-04:00", { endsAt: null })).toBe("directions");
    expect(showAt("2026-10-08T22:31:00-04:00", { endsAt: null })).toBe("tickets");
  });

  it("falls back to Add to calendar outside the window when nothing is sold", () => {
    expect(colorfestAt("2026-10-09T12:00:00-04:00")).toBe("calendar");
  });

  it("opens at 7 AM on the first day of a multi-day event", () => {
    expect(colorfestAt("2026-10-10T06:59:00-04:00")).toBe("calendar");
    expect(colorfestAt("2026-10-10T07:00:00-04:00")).toBe("directions");
  });

  it("closes each day at the event's closing time and reopens at 7 AM on day 2", () => {
    expect(colorfestAt("2026-10-10T16:59:00-04:00")).toBe("directions");
    expect(colorfestAt("2026-10-10T17:01:00-04:00")).toBe("calendar");
    expect(colorfestAt("2026-10-11T06:30:00-04:00")).toBe("calendar");
    expect(colorfestAt("2026-10-11T10:00:00-04:00")).toBe("directions");
  });

  it("closes for good at the final end", () => {
    expect(colorfestAt("2026-10-11T17:00:00-04:00")).toBe("calendar");
    expect(colorfestAt("2026-10-12T10:00:00-04:00")).toBe("calendar");
  });

  it("waits until 3 hours before an evening start on the first day", () => {
    const fridayNight = {
      ...colorfest,
      startsAt: "2026-10-09T18:00:00-04:00",
      endsAt: "2026-10-11T17:00:00-04:00",
    };
    expect(
      eventMobilePrimaryAction({ ...fridayNight, now: new Date("2026-10-09T10:00:00-04:00") }),
    ).toBe("calendar");
    expect(
      eventMobilePrimaryAction({ ...fridayNight, now: new Date("2026-10-09T15:00:00-04:00") }),
    ).toBe("directions");
    expect(
      eventMobilePrimaryAction({ ...fridayNight, now: new Date("2026-10-10T07:00:00-04:00") }),
    ).toBe("directions");
  });

  it("runs an all-day event from 7 AM to midnight on each of its days", () => {
    const market = {
      attendance: "physical" as const,
      ticketUrl: "https://market.example/tickets",
      startsAt: "2026-10-10T00:00:00-04:00",
      // RFC 5545 all-day ends are exclusive: this covers Sat and Sun.
      endsAt: "2026-10-12T00:00:00-04:00",
      isAllDay: true,
      hasDirections: true,
    };
    const at = (now: string) =>
      eventMobilePrimaryAction({ ...market, now: new Date(now) });
    expect(at("2026-10-10T06:00:00-04:00")).toBe("tickets");
    expect(at("2026-10-10T07:00:00-04:00")).toBe("directions");
    expect(at("2026-10-10T23:30:00-04:00")).toBe("directions");
    expect(at("2026-10-11T03:00:00-04:00")).toBe("tickets");
    expect(at("2026-10-11T18:00:00-04:00")).toBe("directions");
    expect(at("2026-10-12T08:00:00-04:00")).toBe("tickets");
  });

  it("never leads an online-only event with Directions", () => {
    expect(
      showAt("2026-10-08T20:00:00-04:00", {
        attendance: "online",
        ticketUrl: null,
        onlineActionUrl: "https://example.org/join",
      }),
    ).toBe("online");
  });

  it("never leads a hybrid or area-only event with Directions", () => {
    expect(showAt("2026-10-08T20:00:00-04:00", { attendance: "mixed" })).toBe("tickets");
    expect(showAt("2026-10-08T20:00:00-04:00", { hasDirections: false })).toBe("tickets");
  });

  it("never leads a cancelled or postponed event with Directions", () => {
    expect(showAt("2026-10-08T20:00:00-04:00", { status: "cancelled" })).toBe("tickets");
    expect(showAt("2026-10-08T20:00:00-04:00", { status: "postponed" })).toBe("tickets");
  });
});

describe("isEventDirectionsWindow", () => {
  it("is closed for an unreadable start", () => {
    expect(
      isEventDirectionsWindow({ now: new Date("2026-10-08T20:00:00-04:00"), startsAt: "soon" }),
    ).toBe(false);
  });

  it("keeps the Eastern clock across the November time change", () => {
    // Nov 1, 2026 is the first day of EST (UTC-5). 7 AM EST is 12:00Z.
    const fallBack = {
      startsAt: "2026-10-31T10:00:00-04:00",
      endsAt: "2026-11-01T16:00:00-05:00",
    };
    expect(
      isEventDirectionsWindow({ ...fallBack, now: new Date("2026-11-01T11:59:00Z") }),
    ).toBe(false);
    expect(
      isEventDirectionsWindow({ ...fallBack, now: new Date("2026-11-01T12:00:00Z") }),
    ).toBe(true);
  });
});
