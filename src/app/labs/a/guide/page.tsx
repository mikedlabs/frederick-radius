import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import Masthead from "../components/Masthead";
import GuideA, { type GuideCandidate } from "./GuideA";

export const dynamic = "force-dynamic";

const GROUPS: Record<GuideCandidate["group"], Set<string>> = {
  eat: new Set(["restaurant", "pizza", "bakery", "cafe"]),
  drink: new Set(["bar", "brewery", "winery", "coffee", "distillery"]),
  outdoors: new Set(["park", "trail", "outdoors", "playground", "garden"]),
  culture: new Set(["museum", "gallery", "theater", "music", "public-art", "historic", "history"]),
};

function groupOf(cat: string): GuideCandidate["group"] | null {
  for (const g of Object.keys(GROUPS) as GuideCandidate["group"][]) {
    if (GROUPS[g].has(cat)) return g;
  }
  return null;
}

function reasonFor(p: PlaceCardData): string {
  if (p.hidden_gem) return "A local secret most visitors never find.";
  if (p.local_favorite) return "The one locals name without thinking.";
  if (typeof p.google_rating === "number" && (p.google_rating_count ?? 0) > 40) {
    return `Frederick keeps coming back: ${p.google_rating.toFixed(1)} across ${p.google_rating_count} visits.`;
  }
  const blurb = (p.short_blurb ?? "").split(/(?<=[.!?])\s/)[0];
  return blurb || "A solid call for today.";
}

export default function LabAGuide() {
  const now = new Date();
  const ranked = rankPlaces({ origin: FREDERICK_CENTER, now, preferOpen: true, profile: "visitor", limit: 200 });
  const candidates: GuideCandidate[] = [];
  for (const p of ranked) {
    const group = groupOf(p.category);
    if (!group) continue;
    candidates.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      group,
      open: p.open_status.state === "open" || p.open_status.state === "closing-soon",
      photo: p.google_photo_url ?? undefined,
      reason: reasonFor(p),
    });
  }

  return (
    <main className="pb-16">
      <Masthead back={{ href: "/labs/a", label: "COVER" }} />
      <GuideA candidates={candidates} />
    </main>
  );
}
