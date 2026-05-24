import { CheckCircle2, Users, Database, Sparkles } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * SourceBadge — a small chip telling the user where this record
 * came from. Three audit reviewers asked for it: trust at the card
 * level. The badge says, in one glance, whether this is hand-curated
 * by Frederick Radius, came from a community feed (Downtown Frederick
 * Partnership scrape), or is a Google-verified business record.
 *
 * Compact (`size="sm"`) for cards; full (`size="md"`) for the place
 * detail header. Self-hides if there's no honest claim to make.
 */
type Tier = "curated" | "verified" | "community" | "official";

function tierFor(place: PlaceCardData): Tier | null {
  // "Curated" — places.ts seed or manual record. These are the
  // hand-picked editorial canon (wineries, the curated 50-odd
  // marquee venues). Highest confidence.
  if (place.source === "seed" || place.source === "manual") return "curated";
  // "Official" — government / county GIS imports.
  if (place.source === "arcgis") return "official";
  // "Verified" — Google says it's operational and we've enriched
  // (we have a rating + hours), so the row is current.
  if (place.is_verified && place.google_verified) return "verified";
  // "Community" — DFP / scraped / discovered. Real but not curated.
  if (place.source === "dfp" || place.source === "google") return "community";
  return null;
}

const META: Record<Tier, { label: string; color: string; icon: typeof CheckCircle2; tooltip: string }> = {
  // Tooltip copy answers the stranger question "what does this badge
  // actually mean?" in plain language. The badge label itself stays
  // short (chip width) but the title attribute gives the explanation
  // a hovering desktop user or a curious tap-and-hold mobile user
  // can read. Previously the title was just "Source: Curated" which
  // tells you nothing if you don't already know what curated means.
  curated:   { label: "Curated",   color: "#C4451C", icon: Sparkles,      tooltip: "We picked this one ourselves." },
  verified:  { label: "Verified",  color: "#1E6B3A", icon: CheckCircle2,  tooltip: "Maintained by the owner. Hours and details come straight from them." },
  community: { label: "Community", color: "#2A5D8F", icon: Users,         tooltip: "Submitted by a local or pulled from a community feed. Reliable but not directly verified." },
  official:  { label: "Official",  color: "#7E2C6F", icon: Database,      tooltip: "From an official county or government feed." },
};

export default function SourceBadge({
  place,
  size = "sm",
}: {
  place: PlaceCardData;
  size?: "sm" | "md";
}) {
  const tier = tierFor(place);
  if (!tier) return null;
  const meta = META[tier];
  const Icon = meta.icon;
  const isSm = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold tracking-tight ${
        isSm
          ? "px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]"
          : "px-2.5 py-1 text-[11px]"
      }`}
      style={{
        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        color: meta.color,
      }}
      title={meta.tooltip}
    >
      <Icon
        className={isSm ? "h-2.5 w-2.5" : "h-3 w-3"}
        strokeWidth={2.5}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
