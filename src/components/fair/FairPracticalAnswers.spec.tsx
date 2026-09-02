import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";
import type { FairPracticalAnswer } from "@/lib/fair/practical-answers";

import FairPracticalAnswers from "./FairPracticalAnswers";

describe("FairPracticalAnswers", () => {
  it("starts with intent-led help instead of publishing the full answer directory", () => {
    const html = renderToStaticMarkup(
      <FairPracticalAnswers answers={greatFrederickFair2026PracticalAnswers} />,
    );

    expect(html).toContain("What do you need right now?");
    expect(html).toContain("Family Care + changing");
    expect(html).toContain("Parking payment");
    expect(html).toContain("Lost person or item");
    expect(html).toContain("Mobility help");
    expect(html).toContain("Browse all official answers");
    expect(html).not.toContain("Do any parking lots require cash?");
    expect(html).not.toContain(
      "Can I leave the Fair and come back on the same ticket?",
    );
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(html).toContain(
      "Choose a common need or search all practical answers.",
    );
  });

  it("opens a source-backed answer when an essential sends a focus target", () => {
    const html = renderToStaticMarkup(
      <FairPracticalAnswers
        answers={greatFrederickFair2026PracticalAnswers}
        focusAnswerId="fair-answer-family-care"
      />,
    );

    expect(html).toContain("Where can a family handle nursing or diaper changes?");
    expect(html).toContain("every restroom also has a diaper-changing station");
    expect(html).toContain("Verified from official Fair sources");
    expect(html).toContain("https://thegreatfrederickfair.com/faq/");
    expect(html).not.toContain("Can I leave the Fair and come back on the same ticket?");
  });

  it("keeps community leads off the public visitor surface", () => {
    const communityLead: FairPracticalAnswer = {
      id: "fair-answer-private-lead",
      category: "arrival",
      question: "Is this unconfirmed community lead public?",
      answer:
        "This is a private research lead that still needs verification from an authoritative source.",
      evidence: "community-pattern",
      usefulBefore: ["park"],
      sources: [
        {
          publisher: "Public discussion",
          label: "Discussion one",
          url: "https://www.reddit.com/r/frederickmd/",
          checkedAt: "2026-09-01T20:58:08Z",
        },
        {
          publisher: "Public discussion",
          label: "Discussion two",
          url: "https://www.reddit.com/r/frederickmd/new/",
          checkedAt: "2026-09-01T20:58:08Z",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <FairPracticalAnswers answers={[communityLead]} />,
    );

    expect(html).not.toContain(communityLead.question);
    expect(html).not.toContain(communityLead.answer);
    expect(html).toContain("No practical answers are available.");
  });
});
