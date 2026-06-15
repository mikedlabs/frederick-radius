import { describe, it, expect } from "vitest";
import { buildTodayAnswers, type TodayAnswerInput } from "@/lib/answers/defaultTodayAnswers";

/**
 * /today taming — the featured event must not be NAMED twice on the page.
 * It already heroes TodayMoves + the "What's on" section, so when a
 * tonight/weekend best bet IS that featured event, its answer card drops
 * to a count + door. A *different* best bet is still named (additive).
 */
const base: TodayAnswerInput = {
  tonightCount: 0,
  tonightBest: null,
  weekendCount: 0,
  weekendBest: null,
  parking: null,
};
const find = (a: ReturnType<typeof buildTodayAnswers>, id: string) => a.find((x) => x.id === id);

describe("buildTodayAnswers — no duplicate naming of the featured event", () => {
  it("tonight card is count + door when its best bet IS the featured hero", () => {
    const out = buildTodayAnswers({
      ...base,
      tonightCount: 3,
      tonightBest: { title: "Jazz at Sky Stage", venue: "Sky Stage", slug: "jazz-sky-stage" },
      featuredSlug: "jazz-sky-stage",
    });
    const tonight = find(out, "tonight")!;
    expect(tonight.title).toBe("On tonight"); // insight-led; count no longer headlines
    expect(tonight.answer).toBeUndefined(); // not "Best bet: Jazz at Sky Stage"
    expect(tonight.secondaryAction?.href).toBe("/events"); // not the per-event detail
  });

  it("tonight card still NAMES a best bet that differs from the featured hero", () => {
    const out = buildTodayAnswers({
      ...base,
      tonightCount: 2,
      tonightBest: { title: "Open Mic", venue: "Cafe Nola", slug: "open-mic-nola" },
      featuredSlug: "some-other-festival",
    });
    const tonight = find(out, "tonight")!;
    expect(tonight.answer).toContain("Open Mic");
    expect(tonight.secondaryAction?.href).toBe("/events/open-mic-nola");
  });

  it("weekend card drops the name when it is the featured hero", () => {
    const out = buildTodayAnswers({
      ...base,
      weekendCount: 5,
      weekendBest: { title: "Oktoberfest", venue: "Carroll Creek", slug: "oktoberfest" },
      featuredSlug: "oktoberfest",
    });
    const weekend = find(out, "weekend")!;
    expect(weekend.title).toBe("This weekend"); // insight-led; count no longer headlines
    expect(weekend.answer).toBeUndefined();
  });

  it("with no featuredSlug, naming behaves as before (back-compat)", () => {
    const out = buildTodayAnswers({
      ...base,
      tonightCount: 1,
      tonightBest: { title: "Trivia Night", venue: "Brewery", slug: "trivia" },
    });
    expect(find(out, "tonight")!.answer).toContain("Trivia Night");
  });
});
