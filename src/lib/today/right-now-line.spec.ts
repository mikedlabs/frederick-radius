import { describe, it, expect } from "vitest";
import { composeRightNow, weatherPhrase, type RightNowSignals } from "./right-now-line";

const WEATHER = { phrase: "Cool and gray this morning", tone: "mixed" as const };
const TONIGHT_EVE = {
  title: "Bluegrass Jam",
  slug: "bluegrass-jam",
  venue: "Steinhardt Brewing",
  timeLabel: "8pm",
  isEvening: true,
};

function signals(over: Partial<RightNowSignals> = {}): RightNowSignals {
  return { weather: null, happy: null, tonight: null, ...over };
}

describe("weatherPhrase — a short sky read, NOT the hero's verdict", () => {
  const MORNING = new Date("2026-07-08T13:00:00.000Z"); // 9 AM ET
  const EVENING = new Date("2026-07-08T23:00:00.000Z"); // 7 PM ET

  it("reads temperature + condition + time of day", () => {
    expect(weatherPhrase(58, "Patchy Fog", MORNING)).toBe("Cool and gray this morning");
    expect(weatherPhrase(72, "Sunny", EVENING)).toBe("Mild and clear this evening");
    expect(weatherPhrase(30, "Snow", MORNING)).toBe("Cold and snowy this morning");
    expect(weatherPhrase(90, "Mostly Cloudy", EVENING)).toBe("Hot and gray this evening");
  });

  it("drops the sky adjective when the condition is unknown", () => {
    expect(weatherPhrase(70, "", MORNING)).toBe("Mild this morning");
  });
});

describe("composeRightNow — fuses the three signals in order", () => {
  it("sky read, then happy hour, then tonight's headliner", () => {
    const parts = composeRightNow(signals({ weather: WEATHER, happy: { count: 3 }, tonight: TONIGHT_EVE }));
    expect(parts.map((p) => p.key)).toEqual(["weather", "happy", "tonight"]);
    expect(parts[0].text).toBe("Cool and gray this morning");
    expect(parts[0].href).toBeUndefined(); // orientation, not a link
    expect(parts[1].text).toBe("3 happy hours on now");
    expect(parts[1].href).toBe("/happy-hour");
    expect(parts[2].text).toBe("Bluegrass Jam at Steinhardt Brewing tonight");
    expect(parts[2].href).toBe("/events/bluegrass-jam");
  });

  it("names the venue when it's the only happy hour on now", () => {
    const parts = composeRightNow(signals({ happy: { count: 1, venue: "Brewer's Alley" } }));
    expect(parts[0].text).toBe("happy hour at Brewer's Alley");
  });

  it("falls back to a count when a lone happy hour has no venue name", () => {
    const parts = composeRightNow(signals({ happy: { count: 1, venue: null } }));
    expect(parts[0].text).toBe("1 happy hour on now");
  });

  it("a daytime headliner reads with its time, not 'tonight'", () => {
    const parts = composeRightNow(
      signals({ tonight: { title: "Reading of the Declaration", slug: "reading", venue: "City Hall", timeLabel: "12pm", isEvening: false } }),
    );
    expect(parts[0].text).toBe("Reading of the Declaration at City Hall, 12pm");
  });

  it("a daytime headliner with no venue reads 'at <time>'", () => {
    const parts = composeRightNow(
      signals({ tonight: { title: "Story time", slug: "story", venue: null, timeLabel: "10am", isEvening: false } }),
    );
    expect(parts[0].text).toBe("Story time at 10am");
  });

  it("an all-day headliner carries no fabricated time", () => {
    const parts = composeRightNow(
      signals({ tonight: { title: "County Fair", slug: "fair", venue: null, timeLabel: null, isEvening: false } }),
    );
    expect(parts[0].text).toBe("County Fair");
  });
});

describe("composeRightNow — degrades gracefully when a signal is missing", () => {
  it("weather only", () => {
    expect(composeRightNow(signals({ weather: WEATHER })).map((p) => p.key)).toEqual(["weather"]);
  });

  it("weather + tonight (no happy hour)", () => {
    expect(composeRightNow(signals({ weather: WEATHER, tonight: TONIGHT_EVE })).map((p) => p.key)).toEqual([
      "weather",
      "tonight",
    ]);
  });

  it("happy + tonight with no forecast", () => {
    expect(
      composeRightNow(signals({ happy: { count: 2 }, tonight: TONIGHT_EVE })).map((p) => p.key),
    ).toEqual(["happy", "tonight"]);
  });

  it("returns an empty list when every signal is missing (honest empty)", () => {
    expect(composeRightNow(signals())).toEqual([]);
  });

  it("treats zero happy hours and a blank sky phrase as absent", () => {
    const parts = composeRightNow(signals({ weather: { phrase: "  ", tone: "good" }, happy: { count: 0 }, tonight: TONIGHT_EVE }));
    expect(parts.map((p) => p.key)).toEqual(["tonight"]);
  });

  it("clamps a firehose title on a word boundary", () => {
    const long = "The Annual Downtown Frederick Independence Day Reading of the Declaration";
    const parts = composeRightNow(signals({ tonight: { title: long, slug: "x", venue: null, timeLabel: null, isEvening: true } }));
    expect(parts[0].text.endsWith("… tonight")).toBe(true);
    expect(parts[0].text.length).toBeLessThan(long.length + 10);
  });
});
