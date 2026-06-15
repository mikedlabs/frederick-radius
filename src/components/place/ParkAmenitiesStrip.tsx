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

  // Amenity TYPE labels answer "does this park have X?" — no emoji (off
  // brand), no directory tallies. Trail miles is the one magnitude kept:
  // it materially changes the plan (a short loop vs a long network).
  const chips: string[] = [];
  if (a.playgrounds) chips.push("Playgrounds");
  if (a.shelters) chips.push("Shelters");
  if (a.fields) chips.push("Sports fields");
  if (a.trails) chips.push(a.trailMiles ? `Trails · ${a.trailMiles} mi` : "Trails");
  if (a.facilities) chips.push("Restrooms");
  if (a.barrierFree) chips.push("Barrier-free");
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
