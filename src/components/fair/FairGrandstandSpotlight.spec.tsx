// @vitest-environment jsdom

import { existsSync } from "node:fs";
import path from "node:path";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import FairGrandstandSpotlight, {
  FAIR_GRANDSTAND_SPOTLIGHT_IMAGE,
  FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_LARGE,
  FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_SRC_SET,
} from "./FairGrandstandSpotlight";
import type { FairDayScheduleItemView } from "./types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const item: FairDayScheduleItemView = {
  id: "schedule-2026-09-18-daughtry",
  date: "2026-09-18",
  title: "Daughtry",
  detail:
    "Daughtry is the 8 p.m. headliner. The opener has not been published.",
  timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
  placeLabel: "Published place: Grandstand.",
  kind: "concert",
  sourceUrl: "https://thegreatfrederickfair.com/grandstand/",
  sourceReview: {
    reviewedOn: "2026-09-04",
    validThrough: "2026-09-26",
    sourceRevision: "manual-review-2026-09-04",
  },
  performanceSlots: [
    {
      name: null,
      timeLabel: "6:30 p.m.",
      startsAt: "2026-09-18T18:30:00-04:00",
      role: "opener",
      nameStatus: "not-published",
    },
    {
      name: "Daughtry",
      timeLabel: "8 p.m.",
      startsAt: "2026-09-18T20:00:00-04:00",
      role: "headliner",
      nameStatus: "named",
    },
  ],
  sourceItem: {
    id: "schedule-2026-09-18-daughtry",
    dayId: "fair-day-2026-09-18",
    fairDate: "2026-09-18",
    sourcePosition: 1,
    text: "Daughtry - Presented by Team Reeder",
    timeLabel: "6:30 p.m.",
    inheritedTimeLabel: null,
    timeOrigin: "explicit",
    timing: "exact",
    startsAt: "2026-09-18T22:30:00.000Z",
    endsAt: null,
    sourceUid: "fair-2026@example.com",
    recurrenceId: null,
    sourceModifiedAt: "2026-09-04T12:00:00.000Z",
    sourceUrl: "https://thegreatfrederickfair.com/schedule/",
  },
};

describe("FairGrandstandSpotlight", () => {
  it("renders the reviewed program facts with the owned responsive photograph", () => {
    const html = renderToStaticMarkup(
      createElement(FairGrandstandSpotlight, { item, onOpen: vi.fn() }),
    );

    for (const imageUrl of [
      FAIR_GRANDSTAND_SPOTLIGHT_IMAGE,
      FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_LARGE,
    ]) {
      expect(existsSync(path.join(process.cwd(), "public", imageUrl))).toBe(
        true,
      );
    }
    expect(html).toContain("Grandstand concert");
    expect(html).toContain("Daughtry");
    expect(html).toContain("Headliner <time dateTime=\"2026-09-18T20:00:00-04:00\">8 p.m.</time>");
    expect(html).toContain("Opener <time dateTime=\"2026-09-18T18:30:00-04:00\">6:30 p.m.</time>");
    expect(html).toContain("Grandstand");
    expect(html).toContain(`src="${FAIR_GRANDSTAND_SPOTLIGHT_IMAGE}"`);
    expect(html).toContain(
      `srcSet="${FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_SRC_SET}"`,
    );
  });

  it("keeps the owned atmosphere photo decorative without visible disclaimer clutter", () => {
    const html = renderToStaticMarkup(
      createElement(FairGrandstandSpotlight, { item, onOpen: vi.fn() }),
    );

    expect(html).toMatch(/<img[^>]*alt=""[^>]*aria-hidden="true"/);
    expect(html).not.toContain("Fairgrounds atmosphere from 2024.");
    expect(html).not.toContain("2026 layout");
    expect(html).not.toContain("Daughtry photo");
    expect(html).not.toContain("2026 fairgrounds photo");
  });

  it("opens the existing detail flow from one compact reduced-motion-safe card", () => {
    const onOpen = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(FairGrandstandSpotlight, { item, onOpen }));
    });

    const button = container.querySelector<HTMLButtonElement>(
      'button[data-fair-grandstand-spotlight="schedule-2026-09-18-daughtry"]',
    );
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toContain(
      "Open details for Daughtry",
    );
    expect(button?.className).toContain("h-[196px]");
    expect(button?.className).toContain("motion-reduce:transition-none");
    expect(button?.className).toContain("motion-reduce:active:scale-100");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).toContain("Open details");

    act(() => button?.click());
    expect(onOpen).toHaveBeenCalledWith(item.id, button);

    act(() => root.unmount());
    container.remove();
  });

  it("does not call a non-concert Grandstand item a concert", () => {
    const html = renderToStaticMarkup(
      createElement(FairGrandstandSpotlight, {
        item: { ...item, kind: "motorsport", title: "Demolition Derby" },
        onOpen: vi.fn(),
      }),
    );

    expect(html).toContain("Grandstand spotlight");
    expect(html).not.toContain("Grandstand concert");
  });
});
