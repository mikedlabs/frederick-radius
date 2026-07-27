import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { getWorthALookToday, easternDayKey } from "@/lib/worth-a-look";
import CategoryIcon from "@/components/place/CategoryIcon";
import SectionHeading from "@/components/ui/SectionHeading";
import { isOutdoorRecommendation } from "@/lib/weather-safety";
import { loadOutdoorSafetyHold } from "@/lib/outdoor-safety-live";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * WorthALook — the daily discovery pick list on /today.
 *
 * Real Frederick places chosen for the day; the lineup rotates daily so a
 * returning visitor sees something new. Demoted from a third horizontal swipe
 * rail to a calm vertical list (Jul 2026 lower-page rework): three swipe rails
 * in a row read as a carousel wall, so this one reads down the page as a field
 * guide instead, and the two remaining rails (DaypartNeeds, CuratedPicks) are
 * separated by content.
 *
 * Every pick is selected from the publishable-photo pool. Render that verified
 * business image here instead of discarding it; the category mark remains the
 * honest fallback if a record changes between selection and render.
 */
export default async function WorthALook() {
  const [dailyPicks, hold] = await Promise.all([
    getWorthALookToday(easternDayKey()),
    loadOutdoorSafetyHold(),
  ]);
  const picks = hold
    ? dailyPicks.filter((pick) => !isOutdoorRecommendation(pick))
    : dailyPicks;
  if (picks.length === 0) return null;

  return (
    <section className="mt-6" aria-label="Worth a look today">
      <SectionHeading title="Worth a look today" />
      <ul className="mt-3 divide-y" style={{ borderColor: "var(--app-border)" }}>
        {picks.map((p) => {
          const cat = CATEGORY_BY_SLUG[p.category];
          const catColor = cat?.color ?? "var(--app-brand)";
          return (
            <li key={p.slug}>
              <Link
                href={`/places/${p.slug}`}
                className="tap-44 group flex items-center gap-3 py-2.5"
                aria-label={`${p.name}, ${cat?.name ?? p.category}`}
              >
                {p.google_photo_url ? (
                  <span
                    aria-hidden
                    className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)]"
                    style={{ boxShadow: "var(--app-edge)" }}
                  >
                    <Image
                      src={p.google_photo_url}
                      alt=""
                      fill
                      unoptimized={p.google_photo_url.startsWith("/api/place-photo")}
                      sizes="48px"
                      placeholder="blur"
                      blurDataURL={PAPER_CREAM_BLUR}
                      className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.035]"
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
                    style={{
                      background: `linear-gradient(145deg, color-mix(in srgb, ${catColor} 22%, var(--app-bg-elevated)), color-mix(in srgb, ${catColor} 7%, var(--app-bg-elevated)))`,
                      color: catColor,
                      boxShadow: "var(--app-edge)",
                    }}
                  >
                    <CategoryIcon slug={p.category} strokeWidth={1.75} className="h-5 w-5 opacity-90" style={{ color: catColor }} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-[15px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {p.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                    {cat?.name ?? p.category}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.25}
                  style={{ color: "var(--app-ink-3)" }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
