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

const out = {
  generated_at: new Date().toISOString(),
  count: rows.length,
  closures: rows.sort((a, b) => a.name.localeCompare(b.name)),
};

writeFileSync(
  resolve("src/data/closures.json"),
  JSON.stringify(out, null, 2) + "\n",
);

console.log(`Wrote src/data/closures.json with ${rows.length} suppressed places.`);
