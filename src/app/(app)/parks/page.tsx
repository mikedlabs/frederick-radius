import type { Metadata } from "next";
import Link from "next/link";
import { Trees, ExternalLink } from "lucide-react";
import { getFrederickParks, type Park } from "@/lib/integrations/fcParks";
import {
  getFrederickParkLocations,
  enrichParksWithLocations,
} from "@/lib/integrations/fcParkLocations";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

export const metadata: Metadata = {
  // Promoted back into nav (the Outdoors want's Parks chip lands here),
  // so the orphan-era noindex is lifted per its own reversal note.
  title: "Parks",
  description:
    "Every park and open-space area in Frederick County: type, size, address, and who maintains it. Live from Frederick County GIS.",
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

/** One dense park row: name + type/address + acres, taps to the map. */
function ParkRow({ p }: { p: Park }) {
  const kind = p.type ? titleCase(p.type) : p.category ? titleCase(p.category) : null;
  const subtitle = [kind, p.address].filter(Boolean).join(" · ") || undefined;
  return (
    <Row
      href={`/map?at=${p.lat},${p.lng}`}
      leading={<IconTile icon={Trees} tone="var(--app-brand-2)" />}
      title={titleCase(p.name)}
      subtitle={subtitle}
      meta={p.acres != null ? `${p.acres} ${p.acres === 1 ? "ac" : "ac"}` : undefined}
    />
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
          Every park and open-space area the county tracks: its type,
          size, and who maintains it. Tap one to see it on the map.
        </p>
        <p className="text-[13px]">
          <Link
            href="/nearby?c=outside"
            className="tap-44-y inline-flex items-center font-medium underline underline-offset-2"
            style={{ color: "var(--app-brand-2, #2E3B2C)" }}
          >
            Find what&rsquo;s nearest you
          </Link>
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
                href: "https://www.cityoffrederickmd.gov/255/Parks-and-Recreation",
                title: "Carroll Creek Park · Frederick",
                meta: "Downtown linear park · amphitheater · the bridge",
              },
              {
                href: "https://www.cityoffrederickmd.gov/255/Parks-and-Recreation",
                title: "Baker Park · Frederick",
                meta: "44 acres downtown · playground · creek loop · band shell",
              },
              {
                href: "https://www.nps.gov/cato/index.htm",
                title: "Catoctin Mountain Park · NPS",
                meta: "5,800 acres · Cunningham Falls vista · the source of the trail map",
              },
              {
                href: "https://dnr.maryland.gov/publiclands/Pages/western/cunningham.aspx",
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
          {/* Dense, collapsed-by-town. The largest area opens by
              default; the rest tuck away (choice persists per town) so
              the page is navigable at a glance instead of ~13 phone-
              screens of uniform cards. */}
          {groups.map((g, i) => (
            <CollapsibleSection
              key={g.slug}
              title={g.name}
              count={g.list.length}
              countLabel={g.list.length === 1 ? "park" : "parks"}
              headingLevel={2}
              storageKey={`fr.parks.${g.slug}`}
              defaultOpen={i === 0}
            >
              <RowList>
                {g.list.map((p) => (
                  <ParkRow key={p.id} p={p} />
                ))}
              </RowList>
            </CollapsibleSection>
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
