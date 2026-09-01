import { describe, expect, it } from "vitest";

import {
  FAIR_PLAN_STORAGE_KEY,
  addFairPlanItem,
  createFairPlan,
  moveFairPlanItem,
  numberedFairPlanSteps,
  parseFairPlanText,
  readFairPlan,
  reconcileFairPlan,
  removeFairPlanItem,
  serializeFairPlan,
  setFairPlanParty,
  setFairPlanReady,
  toggleFairPlanOffer,
  writeFairPlan,
  type FairPlanStorage,
} from "@/lib/fair/plan";
import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

const REVISION_A = `sha256:${"a".repeat(64)}`;
const REVISION_B = `sha256:${"b".repeat(64)}`;

function item(idSuffix: string, text = `Schedule item ${idSuffix}`): FairScheduleSourceItem {
  return {
    id: `schedule-2026-09-20-${idSuffix}`,
    dayId: "day-2026-09-20",
    fairDate: "2026-09-20",
    sourcePosition: 1,
    text,
    timeLabel: "10:00 AM",
    inheritedTimeLabel: null,
    timeOrigin: "explicit",
    timing: "exact",
    startsAt: "2026-09-20T14:00:00.000Z",
    endsAt: null,
    sourceUid: "source-uid",
    recurrenceId: null,
    sourceModifiedAt: "2026-08-29T12:52:36.000Z",
    sourceUrl: "https://thegreatfrederickfair.com/schedule/",
  };
}

function emptyPlan() {
  return createFairPlan({
    fairId: "great-frederick-fair-2026",
    packRevision: REVISION_A,
    now: "2026-09-01T12:00:00Z",
    selectedDayId: "day-2026-09-20",
  });
}

describe("device-local Fair plan", () => {
  it("adds, deduplicates, moves, removes, and derives numbered steps", () => {
    const first = item("alpha");
    const second = item("bravo");
    let plan = addFairPlanItem(emptyPlan(), first, "2026-09-01T12:01:00Z");
    plan = addFairPlanItem(plan, second, "2026-09-01T12:02:00Z");
    plan = addFairPlanItem(plan, first, "2026-09-01T12:03:00Z");

    expect(plan.steps).toHaveLength(2);
    plan = moveFairPlanItem(plan, second.id, -1, "2026-09-01T12:04:00Z");
    expect(numberedFairPlanSteps(plan).map(({ number, scheduleItemId }) => ({
      number,
      scheduleItemId,
    }))).toEqual([
      { number: 1, scheduleItemId: second.id },
      { number: 2, scheduleItemId: first.id },
    ]);

    plan = removeFairPlanItem(plan, second.id, "2026-09-01T12:05:00Z");
    expect(numberedFairPlanSteps(plan)).toMatchObject([
      { number: 1, scheduleItemId: first.id },
    ]);
  });

  it("stores only bounded source snapshots and explicit user choices", () => {
    let plan = addFairPlanItem(
      emptyPlan(),
      item("alpha", "Rabbit judging"),
      "2026-09-01T12:01:00Z",
    );
    plan = toggleFairPlanOffer(
      plan,
      "offer-adult-admission-online",
      "2026-09-01T12:02:00Z",
    );
    const serialized = serializeFairPlan(plan);

    expect(serialized).toContain("Rabbit judging");
    expect(serialized).not.toMatch(/latitude|longitude|coordinate|note|query/i);
    expect(parseFairPlanText(serialized)).toEqual(plan);
  });

  it("migrates a stored v1 plan without party counts or readiness and persists both", () => {
    const current = emptyPlan();
    const legacy: Record<string, unknown> = { ...current };
    delete legacy.party;
    delete legacy.readyKeys;
    const migrated = parseFairPlanText(JSON.stringify(legacy));

    expect(migrated?.party).toEqual({
      adults11Plus: 0,
      children10Under: 0,
      adultRiders: 0,
      childRiders: 0,
    });
    expect(migrated?.readyKeys).toEqual([]);

    const updated = setFairPlanParty(
      migrated ?? current,
      {
        adults11Plus: 2,
        children10Under: 1,
        adultRiders: 1,
        childRiders: 1,
      },
      "2026-09-01T12:03:00Z",
    );
    expect(parseFairPlanText(serializeFairPlan(updated))?.party).toEqual(
      updated.party,
    );

    const ready = setFairPlanReady(updated, "ticket", true, "2026-09-01T12:04:00Z");
    expect(parseFairPlanText(serializeFairPlan(ready))?.readyKeys).toEqual([
      "ticket",
    ]);
    expect(
      setFairPlanReady(ready, "ticket", true, "2026-09-01T12:05:00Z"),
    ).toEqual(ready);
    expect(
      setFairPlanReady(ready, "ticket", false, "2026-09-01T12:06:00Z")
        .readyKeys,
    ).toEqual([]);
  });

  it("rejects corrupt party counts instead of silently changing them", () => {
    expect(
      parseFairPlanText(
        JSON.stringify({
          ...emptyPlan(),
          party: {
            adults11Plus: 1,
            children10Under: 0,
            adultRiders: 2,
            childRiders: 0,
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects corruption and unsupported versions", () => {
    expect(parseFairPlanText("not json")).toBeNull();
    expect(
      parseFairPlanText(JSON.stringify({ ...emptyPlan(), version: 2 })),
    ).toBeNull();
    expect(
      parseFairPlanText(
        JSON.stringify({
          ...emptyPlan(),
          steps: [
            {
              scheduleItemId: "untrusted-id",
              dayId: "day-2026-09-20",
              labelSnapshot: "Untrusted",
              timeLabelSnapshot: null,
              sourceState: "current",
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("fails quietly when on-device storage is blocked", () => {
    const blocked: FairPlanStorage = {
      getItem() {
        throw new DOMException("blocked");
      },
      setItem() {
        throw new DOMException("blocked");
      },
      removeItem() {
        throw new DOMException("blocked");
      },
    };

    expect(readFairPlan(blocked)).toBeNull();
    expect(writeFairPlan(blocked, emptyPlan())).toBe(false);
  });

  it("persists under the versioned Fair-only storage key", () => {
    const values = new Map<string, string>();
    const storage: FairPlanStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    };

    expect(writeFairPlan(storage, emptyPlan())).toBe(true);
    expect(values.has(FAIR_PLAN_STORAGE_KEY)).toBe(true);
    expect(readFairPlan(storage)).toEqual(emptyPlan());
  });

  it("never heuristically rematches a changed source row", () => {
    const oldItem = item("old", "Same visible label");
    const newItem = item("new", "Same visible label");
    const plan = addFairPlanItem(
      emptyPlan(),
      oldItem,
      "2026-09-01T12:01:00Z",
    );

    const withoutAlias = reconcileFairPlan(
      plan,
      [newItem],
      REVISION_B,
      "2026-09-02T12:00:00Z",
    );
    expect(withoutAlias.plan.steps[0]).toMatchObject({
      scheduleItemId: oldItem.id,
      labelSnapshot: "Same visible label",
      sourceState: "changed-or-removed",
    });
    expect(withoutAlias.appliedAliases).toEqual([]);

    const withReviewedAlias = reconcileFairPlan(
      plan,
      [newItem],
      REVISION_B,
      "2026-09-02T12:00:00Z",
      { [oldItem.id]: newItem.id },
    );
    expect(withReviewedAlias.plan.steps[0]).toMatchObject({
      scheduleItemId: newItem.id,
      sourceState: "current",
    });
    expect(withReviewedAlias.appliedAliases).toEqual([
      { from: oldItem.id, to: newItem.id },
    ]);
  });
});
