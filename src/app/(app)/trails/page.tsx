import type { Metadata } from "next";
import { Mountain, Footprints, Bike, Dog, Accessibility, MapPin } from "lucide-react";
import { getFrederickTrails, type Trail } from "@/lib/integrations/fcTrails";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const metadata: Metadata = {
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

function TrailRow({ t }: { t: Trail }) {
  const meta = [
    t.lengthMi ? `${t.lengthMi} mi` : null,
    t.surface || null,
    t.skill || null,
  ].filter(Boolean);
  return (
    <li
      className="border-t first:border-t-0"
      style={{ borderColor: "var(--app-border)" }}
    >
      <a
        href={`/map?focus=${t.lat},${t.lng}`}
        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--app-bg-sunken)]"
      >
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-positive, #1E6B3A) 16%, transparent)" }}
          aria-hidden
        >
          <Mountain className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-positive, #1E6B3A)" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {t.name}
          </span>
          {t.park && t.park !== t.name && (
            <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {t.park}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {meta.length > 0 && <span>{meta.join(" · ")}</span>}
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
        </span>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </a>
    </li>
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          Frederick County GIS · live
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Trails
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every maintained trail in the county — surface, length, and what
          you can do on it. Tap one to see it on the map.
        </p>
      </header>

      {trails.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The county trail layer is briefly unavailable. It refreshes
          automatically — check back shortly.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-positive, #1E6B3A)" }}>
              {trails.length}
            </strong>{" "}
            trails across {groups.length} {groups.length === 1 ? "area" : "areas"}
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
                className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                {g.list.map((t) => (
                  <TrailRow key={t.id} t={t} />
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
