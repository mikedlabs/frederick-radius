import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HappyHourGuide from "@/components/happy/HappyHourGuide";
import type { HHRow } from "@/components/happy/HappyHourBrowser";
import {
  FIELD_NOTE_CHECK_WINDOW_DAYS,
  fieldNoteCheck,
  placesWithFieldHappyHour,
} from "@/lib/loaders/fieldNotes";
import HappyHourPage, { metadata } from "./page";

type GuideProps = { rows: HHRow[]; checkWindowDays: number };

/** The props the server page hands the client guide. */
function guideProps(node: ReactNode): GuideProps | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = guideProps(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === HappyHourGuide) return element.props as unknown as GuideProps;
  return guideProps(element.props.children);
}

function renderAt(iso: string): GuideProps {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  const props = guideProps(HappyHourPage());
  expect(props).not.toBeNull();
  return props!;
}

const lastVerified = new Map(
  placesWithFieldHappyHour().map((v) => [v.slug, v.happy_hour.last_verified]),
);

describe("/happy-hour check wiring", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands the guide each row's own check reading and the shared window", () => {
    const at = "2026-11-25T17:00:00Z";
    const { rows, checkWindowDays } = renderAt(at);
    expect(checkWindowDays).toBe(FIELD_NOTE_CHECK_WINDOW_DAYS);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const check = fieldNoteCheck(lastVerified.get(row.slug), Date.parse(at));
      expect(row.verified).toBe(check?.label ?? null);
      expect(row.verifiedCurrent).toBe(check?.current ?? false);
    }
  });

  it("marks a row current the day after its recorded check", () => {
    const dates = [...lastVerified.values()]
      .map((value) => (value ? Date.parse(value) : NaN))
      .filter(Number.isFinite);
    const newest = Math.max(...dates);
    const { rows } = renderAt(new Date(newest + 86_400_000).toISOString());
    expect(rows.some((row) => row.verifiedCurrent)).toBe(true);
  });

  it("does not promise checked schedules in its metadata", () => {
    expect(String(metadata.description)).not.toMatch(/verified|source-checked/i);
  });
});
