import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EventWeekRibbon from "./EventWeekRibbon";
import { boardAnswer, type TimeKey } from "./boardCaption";

/**
 * The week ribbon is /events' one date control: seven day cells, a dot on
 * each day with events, and one "This weekend" text button on the caption
 * line. The stories hold the board's lens and day in local state so a tap
 * behaves as it does on the board, and print the answer sentence the board
 * shows under the ribbon.
 */

// Wednesday, October 7, 2026, 9:21 PM Eastern: the review screenshot's clock.
const NOW = "2026-10-08T01:21:00.000Z";
const WEEKEND = ["2026-10-09", "2026-10-10", "2026-10-11"];
const COUNTS: Record<string, number> = {
  "2026-10-08": 6,
  "2026-10-09": 9,
  "2026-10-10": 14,
  "2026-10-11": 5,
  "2026-10-13": 3,
};

type HarnessProps = {
  lens?: TimeKey;
  day?: string | null;
  counts?: Record<string, number> | null;
};

function RibbonHarness({ lens: initialLens = "all", day: initialDay = null, counts = COUNTS }: HarnessProps) {
  const [lens, setLens] = useState<TimeKey>(initialLens);
  const [day, setDay] = useState<string | null>(initialDay);
  const answer = boardAnswer({
    lens,
    day,
    nowISO: NOW,
    count: day ? counts?.[day] ?? 0 : lens === "weekend" ? 28 : 0,
    countKnown: counts !== null,
    narrowed: false,
    firstHorizon: lens === "all" && !day ? "week" : undefined,
  });
  return (
    <div className="space-y-3 p-4" style={{ background: "var(--app-bg)" }}>
      <EventWeekRibbon
        nowISO={NOW}
        countByDate={counts}
        lens={lens}
        day={day}
        weekendDays={WEEKEND}
        onPickDay={(next) => {
          setDay(next);
          setLens("all");
        }}
        onToggleWeekend={(on) => {
          setDay(null);
          setLens(on ? "weekend" : "all");
        }}
      />
      {answer ? (
        <p className="px-1 text-body" style={{ color: "var(--app-ink-2)" }}>
          {answer}
        </p>
      ) : null}
    </div>
  );
}

const meta = {
  title: "Events/Week ribbon",
  component: RibbonHarness,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RibbonHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No selection at 9:21 PM: the sentence says tonight is over. */
export const NothingSelectedAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};

/** The narrowest phone: the row borrows the gutter so cells stay 44px wide. */
export const NothingSelectedAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};

/** ?lens=weekend: Friday to Sunday outlined as one run, "This weekend" pressed. */
export const WeekendAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { lens: "weekend" },
};

/** ?lens=weekend at 320px. */
export const WeekendAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { lens: "weekend" },
};

/** ?d=2026-10-10: Saturday alone, outlined in Ink and pressed. */
export const SaturdayPicked: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { day: "2026-10-10" },
};

/** A narrowed board still loading: no dots, and no numbers announced. */
export const CountsLoading: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { counts: null },
};
