import { describe, expect, it } from "vitest";
import {
  BUSINESS_INFO_FACT_LIMITS,
  BUSINESS_INFO_SHAPE,
  cleanExtractedBusinessInfo,
} from "../scripts/lib/business-info-copy";
import { lintSourceText } from "../scripts/style-lint";

function voiceFindings(value: unknown) {
  return lintSourceText(
    "src/data/business-info.json",
    JSON.stringify(value),
  );
}

describe("business-info public copy cleanup", () => {
  it("plainly rewrites every phrase that failed the July 31 voice gate", () => {
    const cases = [
      {
        input: "Wag's has been a dining destination since 1981.",
        output: "Wag's has been a restaurant since 1981.",
        rules: ["destination"],
      },
      {
        input:
          "Escape This pairs intuitive puzzles with immersive atmospheres across six private rooms.",
        output:
          "Escape This pairs intuitive puzzles with themed settings across six private rooms.",
        rules: ["immersive"],
      },
      {
        input:
          "Clue IQ builds custom-built immersive games with meticulously crafted sets and custom soundscapes.",
        output:
          "Clue IQ builds custom-built themed games with detailed sets and custom soundscapes.",
        rules: ["craft", "immersive"],
      },
      {
        input: "A Game Host provides seamless support and unlimited hints.",
        output: "A Game Host provides support and unlimited hints.",
        rules: ["seamless"],
      },
      {
        input:
          "The spa offers acupuncture and various holistic healing modalities.",
        output: "The spa offers acupuncture and various healing services.",
        rules: ["holistic"],
      },
    ];

    for (const fixture of cases) {
      expect(
        voiceFindings({ known_for: fixture.input }).map(
          (finding) => finding.rule,
        ),
      ).toEqual(fixture.rules);
      const result = cleanExtractedBusinessInfo({ known_for: fixture.input });
      expect(result.info.known_for).toBe(fixture.output);
      expect(result.rewritten).toEqual(["known_for"]);
      expect(result.dropped).toEqual([]);
      expect(voiceFindings(result.info)).toEqual([]);
    }
  });

  it("withholds prose that still fails the shared copy gate", () => {
    const result = cleanExtractedBusinessInfo({
      known_for: "An unforgettable outing for everyone.",
      notable: "Quiet afternoon.",
      happy_hour: "Monday through Friday, 4-6pm.",
    });

    expect(result.info).toEqual({
      happy_hour: "Monday through Friday, 4-6pm.",
    });
    expect(result.dropped).toEqual([
      {
        field: "known_for",
        rules: ["sentence fragment", "unforgettable"],
      },
      { field: "notable", rules: ["sentence fragment"] },
    ]);
  });

  it("retains literal industry language that the public gate allows", () => {
    const result = cleanExtractedBusinessInfo({
      known_for: "The taproom serves craft beer brewed in Frederick.",
    });

    expect(result.info.known_for).toBe(
      "The taproom serves craft beer brewed in Frederick.",
    );
    expect(result.dropped).toEqual([]);
  });

  it("normalizes schedule facts and deduplicates specials without rewriting them", () => {
    const result = cleanExtractedBusinessInfo({
      happy_hour: "  Mon-Fri\n  4-6 p.m.:\t$5 drafts  ",
      hours_text: " Mon 9 a.m.-5 p.m.\nTue 9 a.m.-5 p.m. ",
      specials: [
        "  Taco Tuesday\n5-9 p.m. ",
        "taco tuesday 5-9 p.m.",
        "  Burger night: $10  ",
        "",
        14,
      ],
    });

    expect(result.info).toEqual({
      happy_hour: "Mon-Fri 4-6 p.m.: $5 drafts",
      hours_text: "Mon 9 a.m.-5 p.m. Tue 9 a.m.-5 p.m.",
      specials: ["Taco Tuesday 5-9 p.m.", "Burger night: $10"],
    });
  });

  it("drops sentinel happy hour values and menu items posing as specials", () => {
    const result = cleanExtractedBusinessInfo({
      happy_hour: "Not specified on page",
      specials: [
        "Caprese Burger",
        "Nashville Hot Chicken Pizza",
        "Margarita",
      ],
    });

    expect(result.info).toEqual({});
    expect(result.dropped).toEqual([
      { field: "happy_hour", rules: ["invalid schedule"] },
      { field: "specials", rules: ["not a recurring offer"] },
    ]);
  });

  it("requires a real schedule before treating a weekly deal as happy hour", () => {
    const result = cleanExtractedBusinessInfo({
      happy_hour: "Wednesday: $8 Smoked Bourbon",
      specials: ["Wednesday: $8 Smoked Bourbon"],
    });

    expect(result.info).toEqual({
      specials: ["Wednesday: $8 Smoked Bourbon"],
    });
    expect(result.dropped).toContainEqual({
      field: "happy_hour",
      rules: ["invalid schedule"],
    });
  });

  it("rejects contradictory and dynamic hours instead of freezing them", () => {
    const contradictory = cleanExtractedBusinessInfo({
      hours_text: "Open everyday 11:00am-8:00pm (closed on Sundays)",
    });
    const dynamic = cleanExtractedBusinessInfo({
      hours_text:
        "Open today 12:00 pm-6:00 pm. Closed Thanksgiving and Christmas.",
    });

    expect(contradictory.info.hours_text).toBeUndefined();
    expect(contradictory.dropped).toContainEqual({
      field: "hours_text",
      rules: ["contradictory weekly schedule"],
    });
    expect(dynamic.info.hours_text).toBeUndefined();
    expect(dynamic.dropped).toContainEqual({
      field: "hours_text",
      rules: ["dynamic today value"],
    });
  });

  it.each([
    "Today: 8 AM to 10 PM",
    "Today - 8 AM to 10 PM",
    "Today’s hours are 8 AM to 10 PM",
    "The kitchen closes today at 9 PM",
  ])("rejects same-day hours form %s", (hours_text) => {
    const result = cleanExtractedBusinessInfo({ hours_text });

    expect(result.info.hours_text).toBeUndefined();
    expect(result.dropped).toContainEqual({
      field: "hours_text",
      rules: ["dynamic today value"],
    });
  });

  it("omits oversized schedule facts instead of publishing partial facts", () => {
    const oversizedHappyHour = `Friday 4-6 p.m. ${"x".repeat(
      BUSINESS_INFO_FACT_LIMITS.happyHourChars,
    )}`;
    const oversizedHours = `Monday 9 a.m.-5 p.m. ${"x".repeat(
      BUSINESS_INFO_FACT_LIMITS.hoursTextChars,
    )}`;
    const oversizedSpecial = `Taco Tuesday ${"x".repeat(
      BUSINESS_INFO_FACT_LIMITS.specialChars,
    )}`;

    const result = cleanExtractedBusinessInfo({
      happy_hour: oversizedHappyHour,
      hours_text: oversizedHours,
      specials: [oversizedSpecial, "Wednesday: half-price wings"],
    });

    expect(result.info).toEqual({
      specials: ["Wednesday: half-price wings"],
    });
    expect(JSON.stringify(result.info)).not.toContain(
      oversizedHappyHour.slice(0, BUSINESS_INFO_FACT_LIMITS.happyHourChars),
    );
  });

  it("caps recurring specials after normalization", () => {
    const result = cleanExtractedBusinessInfo({
      specials: Array.from(
        { length: BUSINESS_INFO_FACT_LIMITS.specials + 4 },
        (_, index) => `Monday special ${index + 1}`,
      ),
    });

    expect(result.info.specials).toHaveLength(
      BUSINESS_INFO_FACT_LIMITS.specials,
    );
    expect(result.info.specials?.at(-1)).toBe(
      `Monday special ${BUSINESS_INFO_FACT_LIMITS.specials}`,
    );
  });

  it("tells the extractor to translate marketing language before returning", () => {
    expect(BUSINESS_INFO_SHAPE).toContain(
      "Translate the source's marketing language instead of copying it.",
    );
    expect(BUSINESS_INFO_SHAPE).toContain("immersive");
    expect(BUSINESS_INFO_SHAPE).toContain("destination");
  });
});
