import type { Metadata } from "next";
import { Mountain, Footprints, Bike, Dog, Accessibility, ExternalLink } from "lucide-react";
import { getFrederickTrails, type Trail } from "@/lib/integrations/fcTrails";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Trails",
  description:
    "Every maintained trail in Frederick County — park, surface, length, and what you can do on it. Live from Frederick County GIS.",
};

// Trails change rarely; the integration revalidates weekly.
export const revalidate = 604800;

const USE_ICON: Record<string, typeof Footprints> = {
  hiking: Footprints,
  "mountain biking": Bike,
  "road cycling": Bike,
  dogs: Dog,
};

/** Mapbox static-image URL centered on the trail's start point.
 *  Same outdoors style as /parks so the two surfaces read as one
 *  family. Lazy-loaded by the consuming <img>. */
function mapPreviewUrl(lng: number, lat: number): string | null {
  if (!MAPBOX_TOKEN || typeof lng !== "number" || typeof lat !== "number") {
    return null;
  }
  return (
    `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/` +
    `pin-l+1E6B3A(${lng},${lat})/${lng},${lat},14/560x280@2x?` +
    `access_token=${MAPBOX_TOKEN}`
  );
}

function TrailCard({ t }: { t: Trail }) {
  const meta = [
    t.lengthMi ? `${t.lengthMi} mi` : null,
    t.surface || null,
    t.skill || null,
  ].filter(Boolean);
  const mapUrl = mapPreviewUrl(t.lng, t.lat);
  return (
    <article
      className="tactile tactile-interactive group relative flex flex-col overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] transition"
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      {/* Terrain preview — Mapbox outdoors-v12 with a green pin at
          the trailhead. Lazy-loaded so a hundred-card page doesn't
          fire a hundred image fetches at once. */}
      <div
        className="relative aspect-[2/1] w-full overflow-hidden"
        style={{
          background:
            "color-mix(in srgb, var(--app-positive) 8%, var(--app-bg-sunken))",
        }}
      >
        {mapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- static Mapbox static-image URL per trail; the next/image optimizer round-trip adds latency without saving bytes for already-rasterized map tiles
          <img
            src={mapUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="grid h-full w-full place-items-center"
            style={{
              background:
                "linear-gradient(140deg, color-mix(in srgb, #1E6B3A 60%, white) 0%, #1E6B3A 100%)",
            }}
          >
            <Mountain className="h-16 w-16 opacity-30" style={{ color: "white" }} />
          </div>
        )}
        {/* Length chip top-left — primary fact people scan for */}
        {t.lengthMi != null && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur"
            style={{ color: "var(--app-positive, #1E6B3A)" }}
          >
            <Mountain className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            {t.lengthMi} mi
          </span>
        )}
        {/* Difficulty / surface chip top-right when present */}
        {t.skill && (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold capitalize backdrop-blur"
            style={{ color: "var(--app-ink)" }}
          >
            {t.skill}
          </span>
        )}
      </div>

      <a
        href={`/map?focus=${t.lat},${t.lng}`}
        className="flex flex-1 flex-col gap-1.5 px-3.5 pt-3 pb-3"
      >
        <span className="absolute inset-0" aria-hidden />
        <span
          className="block font-serif text-[16px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {t.name}
        </span>
        {t.park && t.park !== t.name && (
          <span
            className="line-clamp-1 text-[12px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {t.park}
          </span>
        )}
        <span
          className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {meta.length > 0 && meta[0] !== `${t.lengthMi} mi` && <span>{meta.filter((m) => m !== `${t.lengthMi} mi`).join(" · ")}</span>}
          {t.ada && (
            <span className="inline-flex items-center gap-1">
              <Accessibility className="h-3 w-3" strokeWidth={2} aria-hidden /> ADA
            </span>
          )}
          {t.uses.map((u) => {
            const Icon = USE_ICON[u];
            return (
              <span key={u} className="inline-flex items-center gap-1 capitalize">
                {Icon && <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />}
                {u}
              </span>
            );
          })}
        </span>
      </a>
    </article>
  );
}

export default async function TrailsPage() {
  const trails = await getFrederickTrails();

  const byMuni = new Map<string, Trail[]>();
  for (const t of trails) {
    const a = byMuni.get(t.municipality);
    if (a) a.push(t);
    else byMuni.set(t.municipality, [t]);
  }
  const groups = [...byMuni.entries()]
    .map(([slug, list]) => ({
      slug,
      name: MUNICIPALITY_BY_SLUG[slug]?.name ?? slug,
      list: list.sort((a, b) => (b.lengthMi ?? 0) - (a.lengthMi ?? 0)),
    }))
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">
          Frederick County GIS · live
        </p>
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          Trails
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every maintained trail in the county — surface, length, and what
          you can do on it. Tap one to see it on the map.
        </p>
      </header>

      {trails.length === 0 ? (
        <section
          className="space-y-3 rounded-[var(--app-radius-lg)] border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            We&rsquo;re rebuilding our connection to the county trail
            layer. In the meantime, these three sources cover ~95% of
            the trails locals use:
          </p>
          <ul className="space-y-2">
            {[
              {
                href: "https://dnr.maryland.gov/publiclands/Pages/Western/Catoctin.aspx",
                title: "Catoctin Mountain Park · NPS",
                meta: "Cunningham Falls Loop · Wolf Rock · Chimney Rock · Hog Rock",
              },
              {
                href: "https://www.nps.gov/choh/index.htm",
                title: "C&O Canal Towpath · NPS",
                meta: "184 miles flat from Cumberland to Georgetown — Brunswick &amp; Point of Rocks segments",
              },
              {
                href: "https://www.frederickcountymd.gov/253/Trails",
                title: "Frederick County Trails directory",
                meta: "Greenbrier · Gambrill · Sugarloaf · the master trail list",
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
                    style={{ background: "color-mix(in srgb, var(--app-positive, #1E6B3A) 14%, transparent)" }}
                  >
                    <Mountain className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-positive, #1E6B3A)" }} />
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
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-positive, #1E6B3A)" }}>
              {trails.length}
            </strong>{" "}
            trails across {groups.length} {groups.length === 1 ? "area" : "areas"}
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
              {/* Photo-style grid with terrain preview per trail —
                  same Mapbox outdoors-v12 family as /parks so the two
                  aux surfaces read as one design system. */}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map((t) => (
                  <li key={t.id}>
                    <TrailCard t={t} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Data: Frederick County GIS open data, refreshed weekly.
          </p>
        </>
      )}
    </div>
  );
}
