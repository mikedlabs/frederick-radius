import { describe, expect, it } from "vitest";
import {
  isRoutineBusinessInfoType,
  prioritizeBusinessInfoCandidates,
  type BusinessInfoPriorityCandidate,
} from "../scripts/lib/business-info-priority";

const NOW = new Date("2026-07-30T12:00:00Z");

function candidate(
  slug: string,
  patch: Partial<BusinessInfoPriorityCandidate> = {},
): BusinessInfoPriorityCandidate {
  return {
    slug,
    hasUsefulCopy: false,
    hasExistingSource: false,
    hasDecisionFact: false,
    routineRefresh: false,
    ...patch,
  };
}

describe("business-info extraction priority", () => {
  it("matches food types without mistaking a barber for a bar", () => {
    const includes = [
      "restaurant",
      "bar",
      "brew",
      "distill",
      "food",
      "ice_cream",
    ];
    expect(
      isRoutineBusinessInfoType("american_restaurant", undefined, includes),
    ).toBe(true);
    expect(
      isRoutineBusinessInfoType("cocktail_bar", undefined, includes),
    ).toBe(true);
    expect(
      isRoutineBusinessInfoType("ice_cream_shop", undefined, includes),
    ).toBe(true);
    expect(
      isRoutineBusinessInfoType("manufacturer", "brewery", includes),
    ).toBe(true);
    expect(
      isRoutineBusinessInfoType("barber_shop", "services", includes),
    ).toBe(false);
  });

  it("puts never-read copy gaps ahead of refresh work", () => {
    const selected = prioritizeBusinessInfoCandidates(
      [
        candidate("covered-food", {
          hasUsefulCopy: true,
          hasExistingSource: true,
          hasDecisionFact: true,
          routineRefresh: true,
          fetchedAt: "2026-01-01T00:00:00Z",
        }),
        candidate("gap-with-old-fact", {
          hasExistingSource: true,
          hasDecisionFact: true,
          fetchedAt: "2026-01-01T00:00:00Z",
        }),
        candidate("never-read"),
        candidate("gap-without-fact", {
          hasExistingSource: true,
          fetchedAt: "2026-01-01T00:00:00Z",
        }),
      ],
      { limit: 10, now: NOW, refreshDays: 30 },
    );

    expect(selected.map(({ slug, priorityReason }) => [slug, priorityReason]))
      .toEqual([
        ["never-read", "copy-gap-unread"],
        ["gap-without-fact", "copy-gap-no-decision-fact"],
        ["gap-with-old-fact", "copy-gap-refresh"],
        ["covered-food", "routine-refresh"],
      ]);
  });

  it("does not repay for a recently inspected copy gap", () => {
    const selected = prioritizeBusinessInfoCandidates(
      [
        candidate("fresh-gap", {
          hasExistingSource: true,
          fetchedAt: "2026-07-29T00:00:00Z",
        }),
        candidate("fresh-routine", {
          hasUsefulCopy: true,
          hasExistingSource: true,
          hasDecisionFact: true,
          routineRefresh: true,
          fetchedAt: "2026-07-29T00:00:00Z",
        }),
      ],
      { limit: 10, now: NOW, refreshDays: 30 },
    );

    expect(selected).toEqual([]);
  });

  it("keeps covered non-routine places out, even when forced", () => {
    const selected = prioritizeBusinessInfoCandidates(
      [
        candidate("covered-non-routine", {
          hasUsefulCopy: true,
          hasExistingSource: true,
          hasDecisionFact: true,
        }),
        candidate("fresh-gap", {
          hasExistingSource: true,
          fetchedAt: "2026-07-29T00:00:00Z",
        }),
      ],
      { force: true, limit: 10, now: NOW, refreshDays: 30 },
    );

    expect(selected.map((row) => row.slug)).toEqual(["fresh-gap"]);
  });

  it("preserves a one-place investigation request", () => {
    const selected = prioritizeBusinessInfoCandidates(
      [
        candidate("requested", {
          explicitRequest: true,
          hasUsefulCopy: true,
          hasExistingSource: true,
          hasDecisionFact: true,
          fetchedAt: "2026-07-29T00:00:00Z",
        }),
      ],
      { force: true, limit: 10, now: NOW, refreshDays: 30 },
    );

    expect(selected[0]?.priorityReason).toBe("explicit-request");
  });

  it("uses oldest-first ordering and enforces the batch limit", () => {
    const selected = prioritizeBusinessInfoCandidates(
      [
        candidate("newer", {
          hasExistingSource: true,
          fetchedAt: "2026-02-01T00:00:00Z",
        }),
        candidate("older-b", {
          hasExistingSource: true,
          fetchedAt: "2026-01-01T00:00:00Z",
        }),
        candidate("older-a", {
          hasExistingSource: true,
          fetchedAt: "2026-01-01T00:00:00Z",
        }),
      ],
      { limit: 2, now: NOW, refreshDays: 30 },
    );

    expect(selected.map((row) => row.slug)).toEqual(["older-a", "older-b"]);
  });

  it("uses importance to make an equally empty batch more useful", () => {
    const selected = prioritizeBusinessInfoCandidates(
      [
        candidate("thin-long-tail", { importance: 3 }),
        candidate("locally-useful", { importance: 12 }),
      ],
      { limit: 10, now: NOW, refreshDays: 30 },
    );

    expect(selected.map((row) => row.slug)).toEqual([
      "locally-useful",
      "thin-long-tail",
    ]);
  });
});
