import { describe, expect, it } from "vitest";
import { isPublishableHeadline } from "./news";

const NOW = new Date("2026-07-26T16:00:00.000Z");

describe("isPublishableHeadline", () => {
  it("keeps a current local-government headline", () => {
    expect(
      isPublishableHeadline(
        {
          title: "Frederick County opens a new cooling center",
          source: "Frederick County Government",
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects obituary and funeral-home listings", () => {
    expect(
      isPublishableHeadline(
        {
          title: "Mary Alice Smith Obituary May 30, 2026",
          source: "Stauffer Funeral Homes",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects real-estate listings", () => {
    expect(
      isPublishableHeadline(
        {
          title: "5986 Passend Dr, Frederick, MD 21703",
          source: "Realtor.com",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects an old notice republished with a fresh feed timestamp", () => {
    expect(
      isPublishableHeadline(
        {
          title: "Frederick Police Invites Residents to Join National Night Out 2024",
          source: "The City of Frederick, MD",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps a future-year planning story", () => {
    expect(
      isPublishableHeadline(
        {
          title: "County presents the proposed 2027 capital plan",
          source: "The Frederick News-Post",
        },
        NOW,
      ),
    ).toBe(true);
  });
});
