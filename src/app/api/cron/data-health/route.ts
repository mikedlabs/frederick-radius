/**
 * Nightly data-health recompute. Re-runs dedup and copy scoring over the
 * current place data and reports the numbers. It reports, it does not
 * persist: serverless storage is read-only, so the committed artifacts
 * (places-dedup.json, copy-scores.json) are regenerated at build time by
 * `npm run dedup` and `npm run copy:scores`. This route is the health
 * signal for /admin/data-health and external uptime checks.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { PLACES } from "@/data/places";
import { buildDedup } from "@/lib/dedup";
import { classifyDescription, type CopyQuality } from "@/lib/copy-quality";
import { rankPlaces, hoursCoverage } from "@/lib/loaders/places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const dedup = buildDedup(PLACES);
  const folded = Object.entries(dedup).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(dedup).map((v) => v.canonical)).size;

  const copy: Record<CopyQuality, number> = { none: 0, scraped: 0, auto_clean: 0, reviewed: 0 };
  for (const p of PLACES) copy[classifyDescription(p.name, p.description ?? p.short_blurb)]++;

  const ranked = rankPlaces({});
  const coverage = Number((hoursCoverage(ranked) * 100).toFixed(1));

  return NextResponse.json({
    computed_at: new Date().toISOString(),
    places: PLACES.length,
    dedup: { clusters, folded },
    hours: { coverage_pct: coverage, target_pct: 60, below_gate: coverage < 60 },
    copy,
    note: "Recompute only. Commit-time scripts persist the artifacts.",
  });
}
