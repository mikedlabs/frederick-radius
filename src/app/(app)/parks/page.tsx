import type { Metadata } from "next";
import { Trees, Ruler, Building2, ExternalLink } from "lucide-react";
import { getFrederickParks, type Park } from "@/lib/integrations/fcParks";
import {
  getFrederickParkLocations,
  enrichParksWithLocations,
} from "@/lib/integrations/fcParkLocations";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
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

/**
 * Build a Mapbox static-image URL for the park's location. Lazy-
 * loaded (loading="lazy" on the <img>) so a /parks page with 100+
 * cards doesn't fire 100 image fetches up front. Zoom 14 frames a
 * walkable park footprint without losing the surrounding street
 * grid for orientation.
 *
 * @2x retina ensures sharp tiles on phones; the actual cell is
 * 280x140 CSS pixels so the source is 560x280.
 */
function mapPreviewUrl(lng: number, lat: number): string | null {
  if (!MAPBOX_TOKEN || typeof lng !== "number" || typeof lat !== "number") {
    return null;
  }
  // Sage marker matches the brand's outdoor-green family.
  return (
    `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/` +
    `pin-l+2E3B2C(${lng},${lat})/${lng},${lat},14/560x280@2x?` +
    `access_token=${MAPBOX_TOKEN}`
  );
}

function ParkCard({ p }: { p: Park }) {
  const kind = p.type ? titleCase(p.type) : p.category ? titleCase(p.category) : null;
  const mapUrl = mapPreviewUrl(p.lng, p.lat);
  return (
    <article
      className="tactile tactile-interactive group relative flex flex-col overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] transition"
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      {/* Map preview — Mapbox static image with a sage marker at the
          park's centroid. Lazy-loaded so a 100-park page doesn't fire
          100 image fetches on first paint. */}
      <div
        className="relative aspect-[2/1] w-full overflow-hidden"
        style={{ background: "color-mix(in srgb, var(--app-brand-2) 8%, var(--app-bg-sunken))" }}
      >
        {mapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- static Mapbox static-image URL per park; the next/image optimizer round-trip adds latency without saving bytes for already-rasterized map tiles
          <img
            src={mapUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          // No-token / no-coord fallback — sage gradient + watermark
          // tree, same visual language as CategoryGraphic. Real parks
          // always have lat/lng, so this only fires in dev with no
          // Mapbox token set.
          <div
            aria-hidden
            className="grid h-full w-full place-items-center"
            style={{
              background:
                "linear-gradient(140deg, color-mix(in srgb, #2E3B2C 60%, white) 0%, #2E3B2C 100%)",
            }}
          >
            <Trees className="h-16 w-16 opacity-30" style={{ color: "white" }} />
          </div>
        )}
        {/* Kind chip over the map for instant category read */}
        {kind && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur"
            style={{ color: "var(--app-brand-2, #2E3B2C)" }}
          >
            <Trees className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            {kind}
          </span>
        )}
        {/* Acres chip on the opposite corner so two key facts read
            from the photo strip without scanning body text */}
        {p.acres != null && (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums backdrop-blur"
            style={{ color: "var(--app-ink)" }}
          >
            <Ruler className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            {p.acres} {p.acres === 1 ? "acre" : "acres"}
          </span>
        )}
      </div>

      <a
        href={`/map?focus=${p.lat},${p.lng}`}
        className="flex flex-1 flex-col gap-1.5 px-3.5 pt-3 pb-2.5"
      >
        <span className="absolute inset-0" aria-hidden />
        <span
          className="block font-serif text-[16px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {titleCase(p.name)}
        </span>
        {p.address && (
          <span
            className="line-clamp-1 text-[12px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {p.address}
          </span>
        )}
        {p.maintainedBy && (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Building2 className="h-3 w-3" strokeWidth={2} aria-hidden />
            {titleCase(p.maintainedBy)}
          </span>
        )}
      </a>

      {p.detailsUrl && (
        <a
          href={p.detailsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 inline-flex items-center gap-1 border-t px-3.5 py-2 text-[11px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
          style={{
            color: "var(--app-cool)",
            borderColor: "var(--app-border)",
          }}
        >
          Official page
          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
        </a>
      )}
    </article>
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
        <section
          className="space-y-3 rounded-[var(--app-radius-lg)] border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            We&rsquo;re rebuilding our connection to the county parks
            layer. In the meantime, these are the parks that carry the
            weight of the system:
          </p>
          <ul className="space-y-2">
            {[
              {
                href: "https://www.cityoffrederickmd.gov/175/Carroll-Creek-Park",
                title: "Carroll Creek Park · Frederick",
                meta: "Downtown linear park · amphitheater · the bridge",
              },
              {
                href: "https://www.cityoffrederickmd.gov/176/Baker-Park",
                title: "Baker Park · Frederick",
                meta: "44 acres downtown · playground · creek loop · band shell",
              },
              {
                href: "https://www.nps.gov/cato/index.htm",
                title: "Catoctin Mountain Park · NPS",
                meta: "5,800 acres · Cunningham Falls vista · the source of the trail map",
              },
              {
                href: "https://dnr.maryland.gov/publiclands/Pages/western/cunninghamfalls.aspx",
                title: "Cunningham Falls State Park · MD DNR",
                meta: "78-foot cascade · Hunting Creek Lake · car-camping",
              },
              {
                href: "https://www.frederickcountymd.gov/2106/Parks-Recreation",
                title: "Frederick County Parks &amp; Rec",
                meta: "Master directory · pavilion reservations · seasonal programming",
              },
            ].map((t) => (
              <li key={t.href}>
                <a
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] px-3 py-2.5 transition hover:bg-[var(--app-bg-elevated)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                    style={{ background: "color-mix(in srgb, var(--app-brand-2, #2E3B2C) 14%, transparent)" }}
                  >
                    <Trees className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand-2, #2E3B2C)" }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                      {t.title}
                    </span>
                    <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                      {t.meta}
                    </span>
                  </span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            The full searchable list returns once we&rsquo;ve wired the
            new feed.
          </p>
        </section>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-brand-2, #2E3B2C)" }}>
              {parks.length}
            </strong>{" "}
            parks across {groups.length} {groups.length === 1 ? "area" : "areas"}
          </p>
          {groups.map((g) => (
            <section key={g.slug} className="space-y-3">
              <h2
                className="font-serif text-lg font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {g.name}{" "}
                <span
                  className="text-[12px] font-normal"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {g.list.length}
                </span>
              </h2>
              {/* Photo-style grid (Mapbox static thumbnail per card)
                  instead of the v1 row list. 1 col on phone, 2 on
                  small tablet, 3 on desktop so the page reads as a
                  field-guide gallery, not a phone book. */}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map((p) => (
                  <li key={p.id}>
                    <ParkCard p={p} />
                  </li>
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
