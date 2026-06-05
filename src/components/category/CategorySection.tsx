import PlaceCard from "@/components/place/PlaceCard";
import SectionHeading from "@/components/ui/SectionHeading";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * CategorySection — one labelled answer-section on a context-aware
 * category page (Best matches / Open now / Local favorites / Nearby).
 * Self-hides when empty so a sparse town never shows a defeating blank.
 * `tile` is the visual 3-up lead; `row` is the dense, scannable list.
 * Optional per-place `reasons` render a quiet caption (Best matches).
 */
export default function CategorySection({
  title,
  color,
  places,
  variant = "row",
  reasons,
}: {
  title: string;
  color: string;
  places: PlaceCardData[];
  variant?: "row" | "tile";
  reasons?: (p: PlaceCardData) => string[];
}) {
  if (places.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <SectionHeading title={title} count={places.length} accent={color} />
      <ul className={variant === "tile" ? "grid gap-2 sm:grid-cols-3" : "space-y-2"}>
        {places.map((p) => {
          const rs = reasons?.(p) ?? [];
          return (
            <li key={p.slug}>
              <PlaceCard place={p} variant={variant} />
              {rs.length > 0 && (
                <p className="mt-1 px-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {rs.join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
