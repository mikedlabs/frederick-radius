/** Fast, deterministic Ask Radius quality gate. No paid model calls. */
import {
  ASK_EVAL_CASES,
  ASK_EVAL_DIMENSIONS,
} from "@/lib/ask/evaluation";
import { parseAskIntent } from "@/lib/ask/intent";
import { wantsWeather, wantsWeatherAnswer } from "@/lib/ask/context";
import { qualifiedSearch } from "@/lib/search";
import { FREDERICK_CENTER } from "@/lib/geo";
import { EVENTS } from "@/data/events";

const failures: string[] = [];
// Keep the committed seed-event checks anchored to a day with a real evening
// program. A release gate must not start failing merely because wall-clock time
// moved past the fixture calendar.
const evaluationNow = new Date("2026-07-30T16:00:00.000Z");
const coveredDimensions = new Set(
  ASK_EVAL_CASES.flatMap((test) => test.dimensions ?? []),
);
for (const dimension of ASK_EVAL_DIMENSIONS) {
  if (!coveredDimensions.has(dimension)) {
    failures.push(`evaluation coverage: missing ${dimension}`);
  }
}

for (const test of ASK_EVAL_CASES) {
  const intent = parseAskIntent(test.query, evaluationNow);
  if (intent.kind !== test.intent) {
    failures.push(`${test.name}: intent ${intent.kind}, expected ${test.intent}`);
    continue;
  }
  if (test.expectedTimeNeed !== undefined && intent.timeNeed !== test.expectedTimeNeed) {
    failures.push(`${test.name}: time ${intent.timeNeed}, expected ${test.expectedTimeNeed}`);
  }
  if (test.expectedAudience !== undefined && intent.audience !== test.expectedAudience) {
    failures.push(`${test.name}: audience ${intent.audience}, expected ${test.expectedAudience}`);
  }
  if (
    test.expectedTravelMode !== undefined &&
    intent.travelMode !== test.expectedTravelMode
  ) {
    failures.push(
      `${test.name}: travel mode ${intent.travelMode}, expected ${test.expectedTravelMode}`,
    );
  }
  if (
    test.expectedRequestedDate !== undefined &&
    intent.requestedDate !== test.expectedRequestedDate
  ) {
    failures.push(
      `${test.name}: requested date ${intent.requestedDate}, expected ${test.expectedRequestedDate}`,
    );
  }
  if (test.requireWeatherContext && !wantsWeather(test.query)) {
    failures.push(`${test.name}: weather context was not recognized`);
  }
  if (test.requireWeatherDiscovery && wantsWeatherAnswer(test.query)) {
    failures.push(`${test.name}: activity request was reduced to a weather-only answer`);
  }
  if (!test.requirePlace && !test.requireEvent) continue;
  const context = test.context ?? {
    origin: FREDERICK_CENTER,
    contextLabel: "Downtown Frederick",
    canShowDistance: true,
  };
  const result = qualifiedSearch(test.query, 12, EVENTS, {
    ...context,
    now: evaluationNow,
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
  if (test.requireNearMeApplied && !result.meta.nearMeApplied) {
    failures.push(`${test.name}: near-me context was not applied`);
  }
  if (
    test.expectedContextLabel !== undefined &&
    result.meta.contextLabel !== test.expectedContextLabel
  ) {
    failures.push(
      `${test.name}: context ${result.meta.contextLabel}, expected ${test.expectedContextLabel}`,
    );
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
    if (
      test.expectedLeadCategory !== undefined &&
      leadPlace.place.category !== test.expectedLeadCategory
    ) {
      failures.push(
        `${test.name}: lead category ${leadPlace.place.category}, expected ${test.expectedLeadCategory}`,
      );
    }
    if (
      test.expectedLeadMunicipality !== undefined &&
      leadPlace.place.municipality !== test.expectedLeadMunicipality
    ) {
      failures.push(
        `${test.name}: lead municipality ${leadPlace.place.municipality}, expected ${test.expectedLeadMunicipality}`,
      );
    }
  }
  if (leadEvent?.type === "event") {
    if (
      test.expectedLeadEventTitle !== undefined &&
      leadEvent.event.title !== test.expectedLeadEventTitle
    ) {
      failures.push(
        `${test.name}: lead event ${leadEvent.event.title}, expected ${test.expectedLeadEventTitle}`,
      );
    }
    if (
      test.expectedLeadEventDate !== undefined &&
      !leadEvent.event.starts_at.startsWith(test.expectedLeadEventDate)
    ) {
      failures.push(
        `${test.name}: lead event starts ${leadEvent.event.starts_at}, expected date ${test.expectedLeadEventDate}`,
      );
    }
    if (
      test.expectedLeadEventMunicipality !== undefined &&
      leadEvent.event.municipality !== test.expectedLeadEventMunicipality
    ) {
      failures.push(
        `${test.name}: lead event municipality ${leadEvent.event.municipality}, expected ${test.expectedLeadEventMunicipality}`,
      );
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

// One case can legitimately expose several independent defects. Count failed
// CASES, not failure messages, so the headline can never undercount or turn
// negative when a single question breaks more than one contract.
const failedCaseCount = ASK_EVAL_CASES.filter((test) =>
  failures.some((failure) => failure.startsWith(`${test.name}:`)),
).length;
const passed = ASK_EVAL_CASES.length - failedCaseCount;
console.log(`Ask Radius eval: ${passed}/${ASK_EVAL_CASES.length} passed`);
console.log(
  `Coverage (question parsing): ${ASK_EVAL_DIMENSIONS.map((dimension) => {
    const count = ASK_EVAL_CASES.filter((test) =>
      test.dimensions?.includes(dimension),
    ).length;
    return `${dimension}=${count}`;
  }).join(", ")}`,
);
console.log(
  `Coverage (deterministic retrieval): ${ASK_EVAL_DIMENSIONS.map((dimension) => {
    const count = ASK_EVAL_CASES.filter(
      (test) =>
        (test.requirePlace || test.requireEvent) &&
        test.dimensions?.includes(dimension),
    ).length;
    return `${dimension}=${count}`;
  }).join(", ")}`,
);
for (const failure of failures) console.error(`  FAIL ${failure}`);
if (failures.length > 0) process.exitCode = 1;
