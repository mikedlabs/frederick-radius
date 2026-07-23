/** Fast, deterministic Ask Radius quality gate. No paid model calls. */
import { ASK_EVAL_CASES } from "@/lib/ask/evaluation";
import { parseAskIntent } from "@/lib/ask/intent";
import { qualifiedSearch } from "@/lib/search";
import { FREDERICK_CENTER } from "@/lib/geo";
import { EVENTS } from "@/data/events";

const failures: string[] = [];
for (const test of ASK_EVAL_CASES) {
  const intent = parseAskIntent(test.query);
  if (intent.kind !== test.intent) {
    failures.push(`${test.name}: intent ${intent.kind}, expected ${test.intent}`);
    continue;
  }
  if (!test.requirePlace && !test.requireEvent) continue;
  const result = qualifiedSearch(test.query, 12, EVENTS, {
    origin: FREDERICK_CENTER,
    contextLabel: "Downtown Frederick",
  });
  const leadPlace = result.hits.find((hit) => hit.type === "place");
  const leadEvent = result.hits.find((hit) => hit.type === "event");
  if (test.requirePlace && (!leadPlace || leadPlace.type !== "place")) {
    failures.push(`${test.name}: no place result`);
    continue;
  }
  if (test.requireEvent && (!leadEvent || leadEvent.type !== "event")) {
    failures.push(`${test.name}: no event result in deterministic seed set`);
  }
  if (
    test.requireSafeOpenIfPresent &&
    leadPlace?.type === "place" &&
    leadPlace.place.open_status.state !== "open" &&
    leadPlace.place.open_status.state !== "closing-soon"
  ) {
    failures.push(
      `${test.name}: returned ${leadPlace.place.name} without verified open status`,
    );
  }
  if (leadPlace?.type === "place") {
    if (test.maxLeadDistanceM != null && (leadPlace.place.distance_m ?? Infinity) > test.maxLeadDistanceM) {
      failures.push(`${test.name}: lead ${leadPlace.place.name} is ${Math.round(leadPlace.place.distance_m ?? 0)}m away`);
    }
    if (test.forbidLead?.test(leadPlace.place.name)) {
      failures.push(`${test.name}: forbidden lead ${leadPlace.place.name}`);
    }
  }
  if (test.allowedPlaceCategories) {
    const wrongCategory = result.hits.find(
      (hit) => hit.type === "place" && !test.allowedPlaceCategories?.includes(hit.place.category),
    );
    if (wrongCategory?.type === "place") {
      failures.push(`${test.name}: unrelated ${wrongCategory.place.category} result ${wrongCategory.place.name}`);
    }
  }
}

const passed = ASK_EVAL_CASES.length - failures.length;
console.log(`Ask Radius eval: ${passed}/${ASK_EVAL_CASES.length} passed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
if (failures.length > 0) process.exitCode = 1;
