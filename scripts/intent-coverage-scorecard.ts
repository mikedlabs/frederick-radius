/**
 * Generates docs/intent-coverage-scorecard.md — the town x user-intent view
 * that the broad place scorecard cannot show.
 *
 * A town can have plenty of rows and still answer "0 coffee" because its
 * cafes are filed under restaurant, bakery, or market. This report runs the
 * exact canonical craving matcher used by /today and /nearby after overrides,
 * so a zero here is a real product zero, not a different audit vocabulary.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CRAVINGS, matchesCraving } from "@/data/cravings";
import { MUNICIPALITIES } from "@/data/municipalities";
import { publicPlaces } from "@/lib/loaders/places";

const CORE_KEYS = ["food", "coffee", "drinks", "outside", "grocery", "shops"] as const;
const CORE = CORE_KEYS.map((key) => {
  const craving = CRAVINGS.find((candidate) => candidate.key === key);
  if (!craving) throw new Error(`Unknown core craving: ${key}`);
  return craving;
});

const places = publicPlaces();
const counts = new Map<string, Map<string, number>>();

for (const town of MUNICIPALITIES) {
  const townPlaces = places.filter((place) => place.municipality === town.slug);
  counts.set(
    town.slug,
    new Map(
      CRAVINGS.map((craving) => [
        craving.key,
        townPlaces.filter((place) => matchesCraving(craving, place)).length,
      ]),
    ),
  );
}

const countFor = (town: string, craving: string) => counts.get(town)?.get(craving) ?? 0;
const auditLabel = (town: string, mode: "zero" | "thin") =>
  CRAVINGS.filter((craving) => {
    const count = countFor(town, craving.key);
    return mode === "zero" ? count === 0 : count === 1;
  })
    .map((craving) => craving.label)
    .join(", ") || "—";

const rows = MUNICIPALITIES.map((town) => {
  const placeCount = places.filter((place) => place.municipality === town.slug).length;
  const coreCells = CORE.map((craving) => String(countFor(town.slug, craving.key)));
  return `| ${town.name} | ${town.population.toLocaleString("en-US")} | ${placeCount} | ${coreCells.join(" | ")} | ${auditLabel(town.slug, "zero")} | ${auditLabel(town.slug, "thin")} |`;
});

const zeroCore = MUNICIPALITIES.flatMap((town) =>
  CORE.filter((craving) => countFor(town.slug, craving.key) === 0).map(
    (craving) => `${town.name}: ${craving.label}`,
  ),
);

const md = [
  "# Intent coverage scorecard",
  "",
  "Town-by-intent coverage using the same multi-role matcher as Today and Nearby.",
  "Counts include published places after overrides, deduplication, municipality",
  "claiming, status suppression, and seasonal filtering. Regenerate with",
  "`npm run coverage:intents`.",
  "",
  `_Generated ${new Date().toISOString().slice(0, 10)} — ${places.length} published places, ${CRAVINGS.length} user intents._`,
  "",
  `| Town | Population | All places | ${CORE.map((craving) => craving.label).join(" | ")} | Zero-result intents | One-result intents |`,
  `| --- | ---: | ---: | ${CORE.map(() => "---:").join(" | ")} | --- | --- |`,
  ...rows,
  "",
  "## Core gaps",
  "",
  ...(zeroCore.length ? zeroCore.map((gap) => `- ${gap}`) : ["No zero-result core town-intent pairs."]),
  "",
  "> Zero does not always mean a missing business. In very small towns it may be",
  "> an honest absence. It always means the UI needs a helpful nearby fallback.",
  "",
].join("\n");

writeFileSync(resolve("docs/intent-coverage-scorecard.md"), md);

console.log(
  `Wrote docs/intent-coverage-scorecard.md — ${MUNICIPALITIES.length} towns x ${CRAVINGS.length} intents; ${zeroCore.length} core gaps.`,
);
