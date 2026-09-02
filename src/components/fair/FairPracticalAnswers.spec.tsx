import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";
import type { FairPracticalAnswer } from "@/lib/fair/practical-answers";

import FairPracticalAnswers from "./FairPracticalAnswers";

describe("FairPracticalAnswers", () => {
  it("publishes sourced official answers and labels an unresolved rule", () => {
    const html = renderToStaticMarkup(
      <FairPracticalAnswers answers={greatFrederickFair2026PracticalAnswers} />,
    );
    const publicAnswerCount = greatFrederickFair2026PracticalAnswers.filter(
      (answer) => answer.evidence !== "community-pattern",
    ).length;

    expect(html).toContain("Do any parking lots require cash?");
    expect(html).toContain("Verified from official Fair sources");
    expect(html).toContain("Can I leave the Fair and come back on the same ticket?");
    expect(html).toContain("Not confirmed in the current official pages");
    expect(html).toContain("https://thegreatfrederickfair.com/faq/");
    expect(html).toContain('role="group"');
    expect(html).toContain(
      'aria-label="Filter practical answers by part of the visit"',
    );
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(html).toContain(`${publicAnswerCount} practical answers shown.`);
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
