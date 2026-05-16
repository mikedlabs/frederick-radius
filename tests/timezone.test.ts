/**
 * Timezone regression tests. Run:
 *   node --import tsx --test tests/timezone.test.ts
 * Must pass identically under TZ=UTC and TZ=America/New_York, which is
 * the whole point: event times must not depend on the server timezone.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { easternWallToUtcISO } from "../src/lib/tz";
import { EVENTS } from "../src/data/events";

test("easternWallToUtcISO is correct across EDT and EST", () => {
  // EDT (UTC-4): 5:00 PM Eastern on May 14 is 21:00Z.
  assert.equal(easternWallToUtcISO(2026, 5, 14, 17, 0), "2026-05-14T21:00:00.000Z");
  // EST (UTC-5): 5:00 PM Eastern on Jan 15 is 22:00Z.
  assert.equal(easternWallToUtcISO(2026, 1, 15, 17, 0), "2026-01-15T22:00:00.000Z");
  // Midnight Eastern (all-day anchor), EDT.
  assert.equal(easternWallToUtcISO(2026, 7, 4, 0, 0), "2026-07-04T04:00:00.000Z");
  console.log("3 helper assertions passed");
});

test("seed events store the correct UTC, not server-local", () => {
  const opener = EVENTS.find((e) => e.slug === "alive-at-five-2026-05-07");
  assert.ok(opener, "Alive @ Five opener should exist");
  // Published 5:00 PM Eastern, May 7 2026 (EDT) -> 21:00Z. The old bug
  // stored 17:00Z on a UTC server, rendering 4 hours early.
  assert.equal(opener.starts_at, "2026-05-07T21:00:00.000Z");
  assert.equal(opener.ends_at, "2026-05-08T00:00:00.000Z"); // 8:00 PM ET
  console.log("2 seed-event assertions passed");
});
