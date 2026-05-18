import type { Metadata } from "next";
import { Trees, Ruler, Building2, MapPin, ExternalLink } from "lucide-react";
import { getFrederickParks, type Park } from "@/lib/integrations/fcParks";
import {
  getFrederickParkLocations,
  enrichParksWithLocations,
} from "@/lib/integrations/fcParkLocations";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const metadata: Metadata = {
  title: "Parks",
  description:
    "Every park and open-space area in Frederick County — type, size, address, and who maintains it. Live from Frederick County GIS.",
};

// Parks change rarely; the integration revalidates weekly.
export const revalidate = 604800;

// Source attributes are ALL-CAPS ("COMMUNITY PARK"). Title-case for
// display without mangling the underlying data.
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bOf\b/g, "of");
}

function ParkRow({ p }: { p: Park }) {
  const kind = p.type ? titleCase(p.type) : p.category ? titleCase(p.category) : null;
  return (
    <li
      className="border-t first:border-t-0"
      style={{ borderColor: "var(--app-border)" }}
    >
      <a
        href={`/map?focus=${p.lat},${p.lng}`}
        className="flex items-start gap-3 px-4 pt-3 pb-2 transition-colors hover:bg-[var(--app-bg-sunken)]"
      >
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand-2, #1E3A2F) 16%, transparent)" }}
          aria-hidden
        >
          <Trees className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand-2, #1E3A2F)" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {titleCase(p.name)}
          </span>
          {kind && (
            <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {kind}
            </span>
          )}
          {p.address && (
            <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {p.address}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {p.acres != null && (
              <span className="inline-flex items-center gap-1">
                <Ruler className="h-3 w-3" strokeWidth={2} aria-hidden />
                {p.acres} {p.acres === 1 ? "acre" : "acres"}
              </span>
            )}
            {p.maintainedBy && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                {titleCase(p.maintainedBy)}
              </span>
            )}
          </span>
        </span>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </a>
      {p.detailsUrl && (
        <a
          href={p.detailsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="-mt-1 flex items-center gap-1 pb-2.5 pl-[60px] pr-4 text-[11px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Official county page
          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
        </a>
      )}
    </li>
  );
}

export default async function ParksPage() {
  // Two county layers: POS_Areas (acreage / planning types, the spine)
  // and the cleaner official Park_Locations points (address + detail
  // link). Joined by EXACT normalized name only — never fuzzy, so a
  // wrong address can't land on the wrong park. Both degrade to [].
  const [parksRaw, parkLocs] = await Promise.all([
    getFrederickParks().catch(() => []),
    getFrederickParkLocations().catch(() => []),
  ]);
  const parks = enrichParksWithLocations(parksRaw, parkLocs);

  const byMuni = new Map<string, Park[]>();
  for (const p of parks) {
    const a = byMuni.get(p.municipality);
    if (a) a.push(p);
    else byMuni.set(p.municipality, [p]);
  }
  const groups = [...byMuni.entries()]
    .map(([slug, list]) => ({
      slug,
      name: MUNICIPALITY_BY_SLUG[slug]?.name ?? slug,
      list: list.sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0)),
    }))
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">
          Frederick County GIS · live
        </p>
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          Parks
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every park and open-space area the county tracks — its type,
          size, and who maintains it. Tap one to see it on the map.
        </p>
      </header>

      {parks.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The county parks layer is briefly unavailable. It refreshes
          automatically — check back shortly.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-brand-2, #1E3A2F)" }}>
              {parks.length}
            </strong>{" "}
            parks across {groups.length} {groups.length === 1 ? "area" : "areas"}
          </p>
          {groups.map((g) => (
            <section key={g.slug} className="space-y-2">
              <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {g.name}{" "}
                <span className="text-[12px] font-normal" style={{ color: "var(--app-ink-3)" }}>
                  {g.list.length}
                </span>
              </h2>
              <ul
                className="overflow-hidden rounded-[var(--app-radius-lg)] tactile bg-[var(--app-bg-elevated)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                {g.list.map((p) => (
                  <ParkRow key={p.id} p={p} />
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Data: Frederick County GIS open data (Parks &amp; Open Space
            and official Park Locations), refreshed weekly.
          </p>
        </>
      )}
    </div>
  );
}
