import type { Metadata } from "next";
import { Bath, Wifi, Zap, Bike, Trees, Baby, MapPin } from "lucide-react";
import { amenitiesByKind, type AmenityKind } from "@/lib/loaders/amenities";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Amenities",
  description:
    "Public restrooms, free Wi-Fi, EV charging, bike parking, picnic spots and playgrounds across Frederick County.",
};

// Static OSM data; nothing live to revalidate often.
export const revalidate = 86400;

const ICON: Record<AmenityKind, typeof Bath> = {
  restroom: Bath,
  wifi: Wifi,
  ev_charging: Zap,
  bike_parking: Bike,
  picnic: Trees,
  playground: Baby,
};

export default function AmenitiesPage() {
  const groups = amenitiesByKind();
  const total = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className="space-y-6 stagger">
      <header className="space-y-1.5">
        <p className="eyebrow">OpenStreetMap · civic amenities</p>
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          Amenities
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The practical stuff: where to find a restroom, free Wi-Fi, a
          charger, bike parking, a picnic table or a playground. Tap any
          one to see it on the map.
        </p>
      </header>

      {groups.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Amenity data is briefly unavailable.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-cool)" }}>
              {total}
            </strong>{" "}
            amenities across {groups.length}{" "}
            {groups.length === 1 ? "category" : "categories"}
          </p>

          {groups.map((g) => {
            const Icon = ICON[g.kind];
            return (
              <section key={g.kind} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    <Icon className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
                    {g.label}
                    <Chip tone="cool" tabular>{g.list.length}</Chip>
                  </h2>
                </div>
                <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>{g.blurb}</p>
                <Surface as="ul" elevation={1} className="overflow-hidden">
                  {g.list.map((a) => (
                    <li
                      key={a.id}
                      className="border-t first:border-t-0"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <a
                        href={`/map?focus=${a.lat},${a.lng}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
                      >
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                          style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}
                          aria-hidden
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                            {a.name}
                          </span>
                          {a.detail && (
                            <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                              {a.detail}
                            </span>
                          )}
                        </span>
                        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                      </a>
                    </li>
                  ))}
                </Surface>
              </section>
            );
          })}

          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Amenity data &copy; OpenStreetMap contributors, ODbL. Some
            categories (water fountains, benches) are under-mapped in
            OSM: a future crowdsource layer.
          </p>
        </>
      )}
    </div>
  );
}
