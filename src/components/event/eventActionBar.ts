import type { EventAttendanceMode } from "@/lib/events/attendance";

export type EventMobilePrimaryAction = "tickets" | "online" | "calendar";

/**
 * The one filled action in an upcoming event's mobile action bar.
 *
 * Tickets lead when the event sells them. An online or hybrid event without
 * tickets leads with its online details. Every other event, including an
 * in-person event with no tickets, leads with Add to calendar.
 *
 * Add to calendar used to go quiet whenever `eventOnlineActionUrl` found a
 * URL. That helper falls back to the event's source page, so nearly every
 * in-person event without tickets rendered a bar with no filled primary at
 * all (October 2026 UI audit). Deciding all three from this one rule keeps
 * exactly one primary on every event page.
 */
export function eventMobilePrimaryAction({
  ticketUrl,
  attendance,
  onlineActionUrl,
}: {
  ticketUrl?: string | null;
  attendance: EventAttendanceMode;
  onlineActionUrl?: string | null;
}): EventMobilePrimaryAction {
  if (ticketUrl) return "tickets";
  if (attendance !== "physical" && onlineActionUrl) return "online";
  return "calendar";
}
