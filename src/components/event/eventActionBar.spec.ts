import { describe, expect, it } from "vitest";
import {
  eventAttendanceMode,
  eventOnlineActionUrl,
  type EventAttendanceInput,
} from "@/lib/events/attendance";
import { eventMobilePrimaryAction } from "./eventActionBar";

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
