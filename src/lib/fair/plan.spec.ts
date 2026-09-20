import { describe, expect, it } from "vitest";

import {
  FAIR_PLAN_STORAGE_KEY,
  addFairPlanItem,
  addFairPlanVendor,
  clearFairPlan,
  fairPlanSchema,
  MAX_FAIR_PLAN_STEPS,
  createFairPlan,
  moveFairPlanItem,
  moveFairPlanItemWithinDay,
  numberedFairPlanSteps,
  parseFairPlanText,
  readFairPlan,
  reconcileFairPlan,
  reconcileFairPlanVendors,
  removeFairPlanItem,
  removeFairPlanVendor,
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

  it("reorders stops within one Fair day without crossing another day", () => {
    const sundayFirst = item("sunday-first");
    const friday = {
      ...item("friday"),
      id: "schedule-2026-09-18-friday",
      dayId: "day-2026-09-18",
      fairDate: "2026-09-18",
    };
    const sundaySecond = item("sunday-second");
    let plan = addFairPlanItem(
      emptyPlan(),
      sundayFirst,
      "2026-09-01T12:01:00Z",
    );
    plan = addFairPlanItem(plan, friday, "2026-09-01T12:02:00Z");
    plan = addFairPlanItem(plan, sundaySecond, "2026-09-01T12:03:00Z");

    plan = moveFairPlanItemWithinDay(
      plan,
      sundaySecond.id,
      -1,
      "2026-09-01T12:04:00Z",
    );

    expect(plan.steps.map((step) => step.scheduleItemId)).toEqual([
      sundaySecond.id,
      friday.id,
      sundayFirst.id,
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
    delete legacy.vendorStops;
    const migrated = parseFairPlanText(JSON.stringify(legacy));

    expect(migrated?.party).toEqual({
      adults11Plus: 0,
      children10Under: 0,
      adultRiders: 0,
      childRiders: 0,
    });
    expect(migrated?.readyKeys).toEqual([]);
    expect(migrated?.vendorStops).toEqual([]);

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

  it("saves anytime vendors in the same plan without invented event times", () => {
    const vendor = { id: "vendor-white-rabbit-rad-pies", name: "White Rabbit x Rad Pies" };
    let plan = addFairPlanVendor(emptyPlan(), vendor, "day-2026-09-20", "2026-09-20T12:00:00Z");
    plan = addFairPlanVendor(plan, vendor, "day-2026-09-20", "2026-09-20T12:01:00Z");
    expect(plan.vendorStops).toEqual([{ vendorId: vendor.id, dayId: "day-2026-09-20", labelSnapshot: vendor.name, sourceState: "current" }]);
    expect(plan.steps).toEqual([]);
    expect(parseFairPlanText(serializeFairPlan(plan))).toEqual(plan);
    expect(serializeFairPlan(plan)).not.toMatch(/timeLabel|latitude|longitude|coordinate|query|booth/);
  });

  it("allows returning to the same vendor on another day and removes only the chosen day", () => {
    const vendor = { id: "vendor-pizza", name: "Pizza" };
    const sunday = addFairPlanVendor(emptyPlan(), vendor, "day-2026-09-20", "2026-09-20T12:00:00Z");
    const monday = addFairPlanVendor(sunday, vendor, "day-2026-09-21", "2026-09-20T12:00:00Z");
    const removed = removeFairPlanVendor(monday, vendor.id, "day-2026-09-20", "2026-09-20T12:00:00Z");
    expect(removed.vendorStops).toHaveLength(1);
    expect(removed.vendorStops[0].dayId).toBe("day-2026-09-21");
    expect(clearFairPlan(removed, "2026-09-20T12:00:00Z").vendorStops).toEqual([]);
  });

  it("preserves vendor choices through schedule reconciliation and flags removed vendor IDs", () => {
    const vendor = { id: "vendor-original", name: "Same visible name" };
    const plan = addFairPlanVendor(emptyPlan(), vendor, "day-2026-09-20", "2026-09-20T12:00:00Z");
    const scheduleReconciled = reconcileFairPlan(plan, [], REVISION_B, "2026-09-20T12:01:00Z").plan;
    expect(scheduleReconciled.vendorStops).toEqual(plan.vendorStops);
    const reviewed = reconcileFairPlanVendors(scheduleReconciled, [{ id: "vendor-different", name: vendor.name }], "2026-09-20T12:02:00Z");
    expect(reviewed.vendorStops[0]).toMatchObject({ vendorId: vendor.id, labelSnapshot: vendor.name, sourceState: "changed-or-removed" });
    expect(reconcileFairPlanVendors(reviewed, [{ ...vendor, name: "Corrected name" }], "2026-09-20T12:03:00Z").vendorStops[0]).toMatchObject({ labelSnapshot: "Corrected name", sourceState: "current" });
  });

  it("bounds the combined plan and rejects duplicate or malformed vendor choices", () => {
    const now = "2026-09-20T12:00:00Z";
    let plan = emptyPlan();
    for (let index = 0; index < MAX_FAIR_PLAN_STEPS - 1; index++) plan = addFairPlanItem(plan, item(`event-${index}`), now);
    plan = addFairPlanVendor(plan, { id: "vendor-one", name: "Vendor one" }, "day-2026-09-20", now);
    expect(() => addFairPlanItem(plan, item("too-many"), now)).toThrow(RangeError);
    expect(() => addFairPlanVendor(plan, { id: "vendor-two", name: "Vendor two" }, "day-2026-09-20", now)).toThrow(RangeError);
    expect(fairPlanSchema.safeParse({ ...emptyPlan(), vendorStops: [plan.vendorStops[0], plan.vendorStops[0]] }).success).toBe(false);
    expect(parseFairPlanText(JSON.stringify({ ...emptyPlan(), vendorStops: [{ ...plan.vendorStops[0], vendorId: "https://evil.example/" }] }))).toBeNull();
  });
});
