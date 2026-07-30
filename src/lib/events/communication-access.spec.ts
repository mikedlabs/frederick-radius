import { describe, expect, it } from "vitest";
import {
  communicationAccessLabels,
  eventCommunicationAccess,
  hasDeafCommunityOrCommunicationAccess,
} from "./communication-access";
import { eventMatchesTopic } from "@/lib/ask/answer";
import type { Event } from "@/data/events";

function event(
  overrides: Partial<Event> & Pick<Event, "slug" | "title">,
): Event {
  return {
    description: "",
    starts_at: "2026-08-01T22:00:00.000Z",
    ends_at: "2026-08-02T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "1 Test Street, Frederick, MD",
    geom: { lat: 39.4143, lng: -77.4105 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    ...overrides,
  };
}

describe("event communication access", () => {
  it("recognizes explicit ASL interpretation and captions", () => {
    const event = {
      title: "Community meeting",
      description:
        "ASL interpreters will be present. The stream includes closed captions.",
    };
    expect(eventCommunicationAccess(event)).toEqual(
      expect.arrayContaining(["asl", "asl_interpreted", "captions"]),
    );
    expect(communicationAccessLabels(event)).toEqual([
      "ASL interpreted",
      "Captions",
    ]);
  });

  it("recognizes Deaf-community events without inventing an interpreter", () => {
    const event = {
      title: "Homecoming",
      source: "msd",
      source_label: "Maryland School for the Deaf",
    };
    expect(eventCommunicationAccess(event)).toEqual(["deaf_community"]);
    expect(communicationAccessLabels(event)).toEqual(["Deaf community"]);
  });

  it("recognizes the Maryland Deaf Community Center source", () => {
    const event = {
      title: "Community gathering",
      source: "mdcc",
    };
    expect(eventCommunicationAccess(event)).toEqual(["deaf_community"]);
    expect(communicationAccessLabels(event)).toEqual(["Deaf community"]);
  });

  it("recognizes a publisher's interpreter-request policy", () => {
    const event = {
      title: "Library storytime",
      description:
        "If an ASL interpreter is needed, please request one a week in advance.",
    };
    expect(eventCommunicationAccess(event)).toEqual(
      expect.arrayContaining(["asl", "interpreter_by_request"]),
    );
    expect(eventCommunicationAccess(event)).not.toContain("asl_interpreted");
    expect(communicationAccessLabels(event)).toEqual([
      "Interpreter by request",
    ]);
  });

  it("keeps an ASL event label when a separate request policy is present", () => {
    const event = {
      title: "ASL storytime",
      description:
        "For other accommodations, please request an interpreter a week in advance.",
    };
    expect(communicationAccessLabels(event)).toEqual([
      "ASL",
      "Interpreter by request",
    ]);
  });

  it("does not infer access from generic event language", () => {
    const event = {
      title: "Outdoor concert",
      description: "Bring a chair and sign up for weather updates.",
    };
    expect(hasDeafCommunityOrCommunicationAccess(event)).toBe(false);
    expect(communicationAccessLabels(event)).toEqual([]);
  });

  it("keeps explicit communication-access searches out of unrelated events", () => {
    const confirmedByPublisher = event({
      slug: "captioned-meeting",
      title: "Community meeting",
      description:
        "The program includes closed captions and an ASL interpreter will be available.",
    });
    const marylandSchoolForTheDeaf = event({
      slug: "msd-homecoming",
      title: "Homecoming",
      source: "msd",
      venue_name: "Maryland School for the Deaf",
    });
    const unrelated = event({
      slug: "summer-concert",
      title: "Summer concert",
      description: "Bring a lawn chair. Food vendors open at 5 PM.",
      category: "music",
    });

    expect(eventMatchesTopic(confirmedByPublisher, "ASL events")).toBe(true);
    expect(eventMatchesTopic(marylandSchoolForTheDeaf, "Deaf events")).toBe(
      true,
    );
    expect(eventMatchesTopic(confirmedByPublisher, "captioned events")).toBe(
      true,
    );
    expect(eventMatchesTopic(unrelated, "ASL or captioned events")).toBe(false);
  });
});
