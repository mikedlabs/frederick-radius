import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsInMunicipality, nearTown, BY_TOWN_ENABLED } from "@/lib/loaders/events";
import { decoratePlace, publicPlacesByMunicipality } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import { CATEGORIES, TOP_CATEGORIES } from "@/data/categories";

export const revalidate = 600;

export async function generateStaticParams() {
  return MUNICIPALITIES.map((m) => ({ municipality: m.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ municipality: string }> }
): Promise<Metadata> {
  const { municipality } = await params;
  const m = MUNICIPALITY_BY_SLUG[municipality];
  if (!m) return { title: "Not found" };
  return {
    title: `${m.name}, Maryland`,
    description: m.description,
    openGraph: {
      title: m.name,
      description: m.hero_blurb,
      images: [{ url: `/api/og?type=municipality&slug=${municipality}`, width: 1200, height: 630 }],
    },
  };
}

export default async function MunicipalityPage(
  { params }: { params: Promise<{ municipality: string }> }
) {
  const { municipality } = await params;
  const m = MUNICIPALITY_BY_SLUG[municipality];
  if (!m) notFound();

  const places = publicPlacesByMunicipality(m.slug)
    .map((p) => decoratePlace(p, m.centroid))
    .sort((a, b) => b.feature_score - a.feature_score);

  const upcomingEvents = eventsInMunicipality(m.slug).slice(0, 6);
  const nearbyEvents = BY_TOWN_ENABLED ? nearTown(m.slug, new Date()) : [];

  const categoryCounts = TOP_CATEGORIES
    .map((c) => ({
      c,
      n: places.filter((p) => {
        const cat = CATEGORIES.find((x) => x.slug === p.category);
        return p.category === c.slug || cat?.parent === c.slug;
      }).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {m.type} · est. {m.est} · pop. {m.population.toLocaleString()}
        </p>
        <h1 className="font-serif text-[32px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {m.name}, Maryland
        </h1>
        <p className="font-serif text-lg italic" style={{ color: "var(--app-brand)" }}>
          {m.hero_blurb}
        </p>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {m.description}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="Places" value={places.length.toString()} />
        <Stat label="Upcoming" value={upcomingEvents.length.toString()} suffix="events" />
        <Stat label="Verified" value={places.filter((p) => p.is_verified).length.toString()} />
      </section>

      {categoryCounts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Browse {m.name}
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {categoryCounts.map(({ c, n }) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  <span style={{ color: c.color }}>●</span>
                  {c.name}
                  <span style={{ color: "var(--app-ink-3)" }}>{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!BY_TOWN_ENABLED && upcomingEvents.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Upcoming in {m.name}
          </h2>
          <ul className="space-y-2">
            {upcomingEvents.map((e) => (
              <li key={e.slug}><EventCard event={e} /></li>
            ))}
          </ul>
        </section>
      )}

      {BY_TOWN_ENABLED && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              Upcoming in {m.name}
            </h2>
            <Link
              href={`/events?view=town&m=${m.slug}`}
              className="shrink-0 text-xs font-medium tracking-tight"
              style={{ color: "var(--app-cool)" }}
            >
              All county events
            </Link>
          </div>
          {upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((e) => (
                <li key={e.slug}><EventCard event={e} /></li>
              ))}
            </ul>
          ) : (
            <div
              className="space-y-4 rounded-[var(--app-radius-lg)] border border-dashed p-4"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--app-ink-2)" }}>
                  No events are on the calendar for {m.name} yet.
                </p>
                <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
                  {m.name} runs on local word of mouth. If you know something
                  happening here, it belongs on this page.
                </p>
              </div>
              <Link
                href={`/submit/event?m=${m.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
                style={{ background: "var(--app-brand)" }}
              >
                Submit an event for {m.name}
              </Link>
              {nearbyEvents.length > 0 && (
                <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                    Happening near {m.name}
                  </p>
                  <ul className="space-y-2">
                    {nearbyEvents.map((e) => (
                      <li key={e.slug}><EventCard event={e} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Worth your time
        </h2>
        {places.length === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
             style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            We&apos;re still seeding places for {m.name}. Check back soon, or submit a place you love.
          </p>
        ) : (
          <ul className="space-y-2">
            {places.slice(0, 12).map((p) => (
              <li key={p.slug}><PlaceCard place={p} /></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div
      className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color: "var(--app-ink)" }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        {label}{suffix ? ` ${suffix}` : ""}
      </p>
    </div>
  );
}
