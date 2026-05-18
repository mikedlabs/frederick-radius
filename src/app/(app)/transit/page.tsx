import type { Metadata } from "next";
import { Bus, ArrowRight, MapPin } from "lucide-react";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";

export const metadata: Metadata = {
  title: "Transit",
  description:
    "Every TransIT Frederick County bus route — where it goes, on one screen.",
};

export const revalidate = 604800;

export default async function TransitPage() {
  const routes = await getFrederickTransitRoutes();

  // One card per route id; collect its destinations/variations.
  const byRoute = new Map<string, { name: string; dests: Set<string>; lng: number; lat: number }>();
  for (const r of routes) {
    const cur = byRoute.get(r.id);
    if (cur) {
      if (r.destination) cur.dests.add(r.destination);
    } else {
      byRoute.set(r.id, {
        name: r.name,
        dests: new Set(r.destination ? [r.destination] : []),
        lng: r.lng,
        lat: r.lat,
      });
    }
  }
  const list = [...byRoute.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { numeric: true }),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">
          TransIT Services of Frederick County
        </p>
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          Transit
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every county bus route and where it goes. Tap a route to see
          it on the map.
        </p>
      </header>

      {list.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The transit route feed is briefly unavailable. It refreshes
          automatically — check back shortly.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-cool)" }}>
              {list.length}
            </strong>{" "}
            routes
          </p>
          <ul
            className="overflow-hidden rounded-[var(--app-radius-lg)] tactile bg-[var(--app-bg-elevated)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            {list.map((r, i) => {
              const dests = [...r.dests].filter(Boolean).slice(0, 3).join(" · ");
              return (
                <li key={i} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--app-border)" }}>
                  <a
                    href={`/map?focus=${r.lat},${r.lng}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--app-bg-sunken)]"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: "color-mix(in srgb, var(--app-cool) 16%, transparent)" }}
                      aria-hidden
                    >
                      <Bus className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                        {r.name}
                      </span>
                      {dests && (
                        <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                          {dests}
                        </span>
                      )}
                    </span>
                    <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
          <div
            className="flex items-start gap-2 rounded-[var(--app-radius-md)] border border-dashed px-4 py-3 text-[12px]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              Live arrivals and vehicle positions need TransIT&apos;s
              GTFS feed (its cataloged URL is currently offline) — coming
              once the county confirms the live feed. Routes here are
              from Maryland Open Data.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
