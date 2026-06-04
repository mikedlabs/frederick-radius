import parkAmenities from "@/data/park-amenities.json";

/**
 * ParkAmenitiesStrip — rolls the county Parks & Rec amenity counts onto a
 * park detail page (src/data/park-amenities.json, keyed by slug, built by
 * scripts/build-park-amenities.ts). Renders nothing unless this place is a
 * park with rolled-up amenities, so it's safe to drop on every place.
 *
 * Counts only — the individual shelters/fields aren't standalone cards
 * (answers, not a directory). Carries its source for the trust gate.
 */

type Amenities = {
  playgrounds: number;
  shelters: number;
  fields: number;
  facilities: number;
  trails: number;
  maxShelterCap?: number;
  trailMiles?: number;
  barrierFree?: boolean;
};

const MAP = parkAmenities as Record<string, Amenities>;

export default function ParkAmenitiesStrip({ slug }: { slug: string }) {
  const a = MAP[slug];
  if (!a) return null;

  const chips: string[] = [];
  if (a.playgrounds) chips.push(`🛝 ${a.playgrounds} playground${a.playgrounds === 1 ? "" : "s"}`);
  if (a.shelters) chips.push(`⛺ ${a.shelters} shelter${a.shelters === 1 ? "" : "s"}${a.maxShelterCap ? ` · seats ${a.maxShelterCap}` : ""}`);
  if (a.fields) chips.push(`🏟️ ${a.fields} field${a.fields === 1 ? "" : "s"}/court${a.fields === 1 ? "" : "s"}`);
  if (a.trails) chips.push(`🥾 ${a.trailMiles ? `${a.trailMiles} mi` : `${a.trails}`} trail${!a.trailMiles && a.trails === 1 ? "" : "s"}`);
  if (a.facilities) chips.push(`🚻 ${a.facilities} facilit${a.facilities === 1 ? "y" : "ies"}`);
  if (a.barrierFree) chips.push("♿ Barrier-free");
  if (chips.length === 0) return null;

  return (
    <section
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        What&rsquo;s in the park
      </h2>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li
            key={c}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-medium tabular-nums"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
          >
            {c}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} aria-hidden />
        Frederick County Parks &amp; Recreation · from GIS
      </p>
    </section>
  );
}
