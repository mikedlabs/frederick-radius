import { describe, expect, it } from "vitest";
import {
  eventFreeStatus,
  eventIsFamilyFriendly,
  eventIsOnlineOnly,
  eventIsMixed,
  eventHasValidOnlineUrl,
} from "./eventFlags";

describe("eventFreeStatus", () => {
  it("returns 'proven' when is_free is true", () => {
    expect(
      eventFreeStatus({
        is_free: true,
      }),
    ).toBe("proven");
  });

  it("returns 'paid' when is_free is false with price evidence", () => {
    expect(
      eventFreeStatus({
        is_free: false,
        price_text: "$10 admission",
      }),
    ).toBe("paid");

    expect(
      eventFreeStatus({
        is_free: false,
        info: { admission: "$5 at the door" },
      }),
    ).toBe("paid");
  });

  it("returns 'unknown' when is_free is false without price evidence", () => {
    expect(
      eventFreeStatus({
        is_free: false,
      }),
    ).toBe("unknown");

    expect(
      eventFreeStatus({
        is_free: false,
        price_text: "",
      }),
    ).toBe("unknown");

    expect(
      eventFreeStatus({
        is_free: false,
        info: {},
      }),
    ).toBe("unknown");
  });

  it("treats a plain FCPL program as proven free", () => {
    expect(
      eventFreeStatus({
        is_free: false,
        source: "fcpl",
        title: "Family Storytime",
        description: "Stories and songs in the community room.",
      }),
    ).toBe("proven");
  });

  it("does not treat an FCPL program with a named fee as proven", () => {
    expect(
      eventFreeStatus({
        is_free: false,
        source: "fcpl",
        title: "Adult Craft Night",
        description: "$10 materials fee",
      }),
    ).not.toBe("proven");
  });

  it("leaves a DFP event on the existing is_free / evidence path", () => {
    expect(
      eventFreeStatus({
        is_free: false,
        source: "dfp",
        title: "Alive @ Five",
      }),
    ).toBe("unknown");
  });
});

describe("eventIsFamilyFriendly", () => {
  it("returns true when kids-* tags are present", () => {
    expect(
      eventIsFamilyFriendly({
        is_free: true,
        audience: ["kids-0-5", "adults"],
      }),
    ).toBe(true);

    expect(
      eventIsFamilyFriendly({
        is_free: true,
        audience: ["kids-6-12"],
      }),
    ).toBe(true);
  });

  it("returns false when no kids-* tags are present", () => {
    expect(
      eventIsFamilyFriendly({
        is_free: true,
        audience: ["adults", "groups"],
      }),
    ).toBe(false);
  });

  it("returns false when audience is empty", () => {
    expect(
      eventIsFamilyFriendly({
        is_free: true,
        audience: [],
      }),
    ).toBe(false);

    expect(
      eventIsFamilyFriendly({
        is_free: true,
      }),
    ).toBe(false);
  });
});

describe("eventIsOnlineOnly", () => {
  it("returns true when attendance_mode is 'online'", () => {
    expect(
      eventIsOnlineOnly({
        is_free: true,
        attendance_mode: "online",
      }),
    ).toBe(true);
  });

  it("returns false for physical or mixed attendance", () => {
    expect(
      eventIsOnlineOnly({
        is_free: true,
        attendance_mode: "physical",
      }),
    ).toBe(false);

    expect(
      eventIsOnlineOnly({
        is_free: true,
        attendance_mode: "mixed",
      }),
    ).toBe(false);
  });

  it("returns false when attendance_mode is missing", () => {
    expect(
      eventIsOnlineOnly({
        is_free: true,
      }),
    ).toBe(false);
  });
});

describe("eventIsMixed", () => {
  it("returns true when attendance_mode is 'mixed'", () => {
    expect(
      eventIsMixed({
        is_free: true,
        attendance_mode: "mixed",
      }),
    ).toBe(true);
  });

  it("returns false for other attendance modes", () => {
    expect(
      eventIsMixed({
        is_free: true,
        attendance_mode: "physical",
      }),
    ).toBe(false);

    expect(
      eventIsMixed({
        is_free: true,
        attendance_mode: "online",
      }),
    ).toBe(false);
  });
});

describe("eventHasValidOnlineUrl", () => {
  it("returns true for physical events regardless of online_url", () => {
    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "physical",
      }),
    ).toBe(true);

    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "physical",
        online_url: "",
      }),
    ).toBe(true);
  });

  it("returns true when online/mixed events have a valid online_url", () => {
    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "online",
        online_url: "https://zoom.us/j/123456789",
      }),
    ).toBe(true);

    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "mixed",
        online_url: "https://example.com/join",
      }),
    ).toBe(true);
  });

  it("returns false when online/mixed events lack online_url", () => {
    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "online",
      }),
    ).toBe(false);

    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "mixed",
        online_url: "",
      }),
    ).toBe(false);

    expect(
      eventHasValidOnlineUrl({
        is_free: true,
        attendance_mode: "online",
        online_url: "   ",
      }),
    ).toBe(false);
  });
});
