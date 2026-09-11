/**
 * Readiness audit — the Tier 1–4 distribution of the live place catalog.
 *
 * Reuses the real loaders (publicPlaces + decoratePlace) and the shared
 * recommendationTier() utility, so this report and the runtime UI score
 * every record identically. Run: `npm run audit:readiness`.
 */
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { recommendationTier, type RecommendationTier } from "@/lib/quality/readiness";

const TIER_LABEL: Record<RecommendationTier, string> = {
  1: "Recommend  (lead a top card)",
  2: "Browse only (real, not a top pick)",
  3: "Needs review (a gate is soft)",
  4: "Hide/archive (closed/junk/incomplete)",
};

function main() {
  const places = publicPlaces().map((p) => decoratePlace(p));
  const counts: Record<RecommendationTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const reasons: Record<RecommendationTier, Map<string, number>> = {
    1: new Map(), 2: new Map(), 3: new Map(), 4: new Map(),
  };
  const examples: Record<RecommendationTier, string[]> = { 1: [], 2: [], 3: [], 4: [] };

  for (const p of places) {
    const { tier, reason } = recommendationTier(p);
    counts[tier]++;
    reasons[tier].set(reason.replace(/\(.*\)/, "").trim(), (reasons[tier].get(reason.replace(/\(.*\)/, "").trim()) ?? 0) + 1);
    if (examples[tier].length < 6) examples[tier].push(`${p.name} [${p.category}/${p.source}]`);
  }

  const total = places.length;
  console.log(`\n=== RECOMMENDATION READINESS — ${total} public places ===\n`);
  for (const t of [1, 2, 3, 4] as RecommendationTier[]) {
    const pct = ((counts[t] / total) * 100).toFixed(1);
    console.log(`Tier ${t} · ${TIER_LABEL[t]}`);
    console.log(`  ${counts[t]} (${pct}%)`);
    const rs = [...reasons[t].entries()].sort((a, b) => b[1] - a[1]);
    for (const [r, n] of rs) console.log(`    - ${r}: ${n}`);
    console.log(`  e.g. ${examples[t].join(" · ")}\n`);
  }
  const topShare = ((counts[1] / total) * 100).toFixed(1);
  console.log(`Top-recommendable (Tier 1): ${counts[1]} / ${total} (${topShare}%)`);
  console.log(`Surfaceable in browse (Tier 1+2): ${counts[1] + counts[2]} (${(((counts[1] + counts[2]) / total) * 100).toFixed(1)}%)\n`);
}

main();
