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
        (_, index) => `Special ${index + 1}`,
      ),
    });

    expect(result.info.specials).toHaveLength(
      BUSINESS_INFO_FACT_LIMITS.specials,
    );
    expect(result.info.specials?.at(-1)).toBe(
      `Special ${BUSINESS_INFO_FACT_LIMITS.specials}`,
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
