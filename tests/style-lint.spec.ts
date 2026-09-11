import { describe, expect, it } from "vitest";
import { lintSourceText } from "../scripts/style-lint";

describe("style lint source classification", () => {
  it("checks prose that contains CSS-like words such as block", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const SYSTEM = `Use the EVENTS block — then answer plainly.`;',
    );

    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "em dash" })]),
    );
  });

  it("ignores actual className values", () => {
    const findings = lintSourceText(
      "fixture.tsx",
      'export const view = <div className="relative block bg-white" />;',
    );

    expect(findings).toEqual([]);
  });

  it("catches a sentence fragment in a prose field", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const card = { description: "Quiet afternoon." };',
    );

    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "sentence fragment" })]),
    );
  });

  it("accepts a complete sentence in a prose field", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const card = { description: "The afternoon is quiet." };',
    );

    expect(findings).toEqual([]);
  });

  it("accepts the exact canonical brand descriptor", () => {
    expect(
      lintSourceText(
        "fixture.tsx",
        "const descriptor = <p>Current local information for Frederick County, organized around where you are.</p>;",
      ),
    ).toEqual([]);
  });

  it("accepts an ordinary complete sentence", () => {
    expect(
      lintSourceText(
        "fixture.ts",
        'const card = { description: "The restaurant hosts trivia." };',
      ),
    ).toEqual([]);
  });

  it.each([
    "Citrus, pine, soft haze and a little bite.",
    "Clean lagers and balanced everyday beer.",
    "Coffee, chocolate, caramel and toasted malt.",
    "Sours, fruit beers and unusual choices.",
  ])("does not mistake a noun or modifier suffix for a verb: %s", (description) => {
    expect(
      lintSourceText(
        "src/lib/beer-experience.ts",
        `const path = { description: ${JSON.stringify(description)} };`,
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "sentence fragment" })]),
    );
  });

  it("does not let a one-word strict prose field masquerade as an enum", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const card = { description: "Vibrant", variant: "elevated" };',
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "vibrant" }),
        expect.objectContaining({ rule: "missing sentence punctuation" }),
      ]),
    );
    expect(findings.filter((finding) => finding.rule === "elevated")).toHaveLength(0);
  });

  it("does not let a hyphenated banned phrase masquerade as a technical enum", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const card = { description: "must-visit" };',
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "must-visit" }),
        expect.objectContaining({ rule: "missing sentence punctuation" }),
      ]),
    );
  });

  it("preserves factual data titles", () => {
    const findings = lintSourceText(
      "src/data/fixture.ts",
      'const item = { title: "Craft Beverage Experience" };',
    );

    expect(findings).toEqual([]);
  });

  it("checks prose fields in JSON data", () => {
    const findings = lintSourceText(
      "src/data/fixture.json",
      '{"name":"Craft Beverage Experience","description":"Quiet afternoon."}',
    );

    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "sentence fragment" })]),
    );
    expect(findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "craft" })]),
    );
  });

  it("allows compact component labels while requiring data blurbs to be sentences", () => {
    expect(
      lintSourceText("src/components/fixture.ts", 'const chip = { blurb: "Coffee run" };'),
    ).toEqual([]);
    expect(
      lintSourceText("src/data/fixture.ts", 'const item = { blurb: "Quiet afternoon" };'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "missing sentence punctuation" }),
      ]),
    );
  });

  it("preserves the exact Hidden gem feature label but rejects the cliche in prose", () => {
    expect(
      lintSourceText("src/lib/fixture.ts", 'const chip = { label: "Hidden gem" };'),
    ).toEqual([]);
    expect(
      lintSourceText(
        "src/lib/fixture.ts",
        'const card = { description: "This restaurant is a hidden gem." };',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "hidden gem" })]),
    );
  });

  it("applies an allowance only to the matching occurrence", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const card = { description: "Craft beer is a literal category. We craft generic copy." };',
    );

    expect(findings.filter((finding) => finding.rule === "craft")).toHaveLength(1);
    expect(findings.find((finding) => finding.rule === "craft")?.snippet).toContain(
      "craft generic copy",
    );
  });

  it("keeps a transit destination exception local to its matching phrase", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const card = { description: "The bus destination appears first. Make this a destination." };',
    );

    expect(findings.filter((finding) => finding.rule === "destination")).toHaveLength(1);
  });

  it("classifies only the exact locked tagline as a label", () => {
    expect(
      lintSourceText(
        "fixture.ts",
        'const brand = { tagline: "Frederick County starts where you are." };',
      ),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.ts",
        'const brand = { tagline: "Frederick County around you." };',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "sentence fragment" })]),
    );
    expect(
      lintSourceText(
        "fixture.tsx",
        "const brand = <p>Frederick County starts where you are.</p>;",
      ),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.tsx",
        "const brand = <p>Frederick County around you.</p>;",
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "sentence fragment" })]),
    );
  });

  it("checks the complete surface of a template expression", () => {
    expect(
      lintSourceText(
        "fixture.ts",
        "const card = { description: `The ${place} hosts trivia.` };",
      ),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.ts",
        "const card = { description: `The ${place} hosts trivia` };",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "missing sentence punctuation" }),
      ]),
    );
    expect(
      lintSourceText("fixture.ts", "const card = { description: `${copy}` };"),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.ts",
        "const card = { description: `An effortless ${kind} plan.` };",
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "effortless" })]),
    );
  });

  it("checks prose assembled from multiple paragraph children", () => {
    expect(
      lintSourceText(
        "fixture.tsx",
        "const card = <p>The <strong>restaurant</strong> hosts trivia.</p>;",
      ),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.tsx",
        "const card = <p><strong>Quiet</strong> afternoon.</p>;",
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "sentence fragment" })]),
    );
  });

  it("rejects generic Discover and Explore actions without banning factual use", () => {
    expect(
      lintSourceText("fixture.tsx", "const button = <button>Explore</button>;"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "explore as generic action" }),
      ]),
    );
    expect(
      lintSourceText(
        "fixture.ts",
        'const card = { description: "Explore tourism across the county." };',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "explore as generic action" }),
      ]),
    );
    expect(
      lintSourceText(
        "fixture.ts",
        'const card = { description: "Use the official map to explore local galleries." };',
      ),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.ts",
        'const card = { description: "Live music starts at 8pm." };',
      ),
    ).toEqual([]);
    expect(
      lintSourceText(
        "fixture.ts",
        'const card = { description: "A live experience starts here." };',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "vague marketing claim" })]),
    );
    expect(
      lintSourceText(
        "fixture.ts",
        'const card = { description: "Everything you need is powered by local data." };',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "everything you need" }),
        expect.objectContaining({ rule: "powered by" }),
      ]),
    );
  });

  it("ignores maintainer-only JSON notes", () => {
    const findings = lintSourceText(
      "src/data/fixture.json",
      '{"_note":"Temporary import instructions","description":"The listing is current."}',
    );

    expect(findings).toEqual([]);
  });

  it("catches an automatic three-beat rhythm", () => {
    const findings = lintSourceText(
      "fixture.ts",
      'const copy = "Find a place. Make a plan. Start your day.";',
    );

    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "three short sentences" })]),
    );
  });

  it("does not treat a factual three-item UI as a rhetorical triad", () => {
    expect(
      lintSourceText(
        "fixture.ts",
        'const filters = ["Coffee", "Dinner", "Live music"];',
      ),
    ).toEqual([]);
  });
});
