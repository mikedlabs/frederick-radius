/**
 * Generates the closures audit log (src/data/closures.json).
 *
 * Lists every place suppressed by closure: the manual denylist (with
 * provenance) plus any curated place flagged closed via is_operational.
 * Run with: npm run closures:report. The committed JSON is the auditable
 * record required by P0-2.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { KNOWN_CLOSED_CANONICAL } from "@/lib/integrations/closures";
import { MANUAL_PLACE_STATUS_OVERRIDES } from "@/lib/place-status-overrides";
import { PLACES } from "@/data/places";

type ClosureRow = {
  name: string;
  place_id: string | null;
  date_marked: string | null;
  source: string;
};

const rows: ClosureRow[] = [];

for (const c of KNOWN_CLOSED_CANONICAL) {
  rows.push({
    name: c.name,
    place_id: c.place_id,
    date_marked: c.closed_since,
    source: c.source,
  });
}

for (const [slug, override] of Object.entries(MANUAL_PLACE_STATUS_OVERRIDES)) {
  const place = PLACES.find((candidate) => candidate.slug === slug);
  rows.push({
    name: place?.name ?? slug,
    place_id: place?.google_place_id ?? null,
    date_marked: override.effective_at,
    source: `manual:${override.status}:${override.source}`,
  });
}

for (const p of PLACES) {
  if (
    p.is_operational === "closed_permanently" ||
    p.is_operational === "closed_temporarily"
  ) {
    rows.push({
      name: p.name,
      place_id: p.google_place_id ?? null,
      date_marked: null,
      source: `curated:${p.is_operational}`,
    });
  }
}

// One suppressed place is one audit row even when two controls catch it
// (for example the canonical denylist and a curated closed_permanently flag).
// Preserve every reason in the source field so deduplication does not erase
// provenance while the report's count remains an honest business count.
const deduped = new Map<string, ClosureRow>();
for (const row of rows) {
  const key = row.place_id
    ? `place:${row.place_id}`
    : `name:${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  const existing = deduped.get(key);
  if (!existing) {
    deduped.set(key, row);
    continue;
  }
  const sources = new Set(
    [...existing.source.split(" + "), ...row.source.split(" + ")].filter(Boolean),
  );
  deduped.set(key, {
    name: existing.name,
    place_id: existing.place_id ?? row.place_id,
    date_marked: existing.date_marked ?? row.date_marked,
    source: [...sources].join(" + "),
  });
}
const uniqueRows = [...deduped.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
);

const out = {
  generated_at: new Date().toISOString(),
  count: uniqueRows.length,
  closures: uniqueRows,
};

writeFileSync(
  resolve("src/data/closures.json"),
  JSON.stringify(out, null, 2) + "\n",
);

console.log(`Wrote src/data/closures.json with ${uniqueRows.length} suppressed places.`);
