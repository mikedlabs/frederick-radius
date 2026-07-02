import { describe, it, expect } from "vitest";
import { validateNotices, filterActive, applyNotices, type EventNotice } from "./notices";
import noticesFile from "@/data/event-notices.json";

const notice = (over: Partial<EventNotice> = {}): EventNotice => ({
  slug: "alive-at-five-2026-07-02",
  status: "cancelled",
  headline: "Alive @ Five is cancelled tonight",
  note: "Called off for the extreme heat.",
  source_url: "https://downtownfrederick.org/aliveatfive/",
  expires: "2026-07-02",
  ...over,
});

describe("validateNotices", () => {
  it("keeps well-formed rows and normalizes optionals", () => {
    const out = validateNotices({ notices: [notice()] });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("cancelled");
    expect(out[0].source_url).toBe("https://downtownfrederick.org/aliveatfive/");
  });

  it("drops rows a phone edit could mangle instead of throwing", () => {
    const out = validateNotices({
      notices: [
        notice(),
        { ...notice(), status: "canceled" }, // misspelled status
        { ...notice(), headline: "  " }, // blank headline
        { ...notice(), expires: "July 2" }, // not a day key
        { ...notice(), slug: "" },
        "not-an-object",
        null,
      ],
    });
    expect(out).toHaveLength(1);
  });

  it("degrades to empty on a broken file shape", () => {
    expect(validateNotices(null)).toEqual([]);
    expect(validateNotices({})).toEqual([]);
    expect(validateNotices({ notices: "oops" })).toEqual([]);
  });

  it("drops a non-http source_url rather than rendering a junk link", () => {
    const out = validateNotices({ notices: [notice({ source_url: "facebook" })] });
    expect(out[0].source_url).toBeUndefined();
  });

  it("the committed event-notices.json is fully valid (a bad edit fails here)", () => {
    const raw = (noticesFile as { notices: unknown[] }).notices;
    expect(validateNotices(noticesFile)).toHaveLength(raw.length);
  });
});

describe("filterActive", () => {
  // 2026-07-02T23:00 Eastern = 2026-07-03T03:00Z
  const lateOnExpiryNight = new Date("2026-07-03T03:00:00Z");
  // 2026-07-03T06:00 Eastern, the morning after
  const morningAfter = new Date("2026-07-03T10:00:00Z");

  it("shows a notice through the END of its expires day, Eastern", () => {
    expect(filterActive([notice()], lateOnExpiryNight)).toHaveLength(1);
  });

  it("retires it the next Eastern morning", () => {
    expect(filterActive([notice()], morningAfter)).toHaveLength(0);
  });
});

describe("applyNotices", () => {
  const events = [
    { slug: "alive-at-five-2026-07-02", status: "scheduled" },
    { slug: "alive-at-five-2026-07-09", status: "scheduled" },
  ];

  it("stamps cancelled onto the matching event only", () => {
    const out = applyNotices(events, [notice()]);
    expect(out[0].status).toBe("cancelled");
    expect(out[1].status).toBe("scheduled");
  });

  it("advisory notices leave status alone (the event is still on)", () => {
    const out = applyNotices(events, [notice({ status: "advisory" })]);
    expect(out[0].status).toBe("scheduled");
  });

  it("returns the same array when nothing matches or applies", () => {
    expect(applyNotices(events, [])).toBe(events);
    expect(applyNotices(events, [notice({ status: "advisory" })])).toBe(events);
  });
});
