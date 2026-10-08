import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, Flag, TriangleAlert, Star, Info, ExternalLink, CloudSun } from "lucide-react";
import { CIVIC_MOMENTS, momentBySlug, type MomentItem, type MomentItemKind } from "@/data/civic-moments";
import FairDayPage from "@/components/fair/FairDayPage";
import InTheStreetsWorkspace from "@/components/in-the-streets/InTheStreetsWorkspace";
import MomentDays from "@/components/moment/MomentDays";
import MomentFacts from "@/components/moment/MomentFacts";
import MomentHero from "@/components/moment/MomentHero";
import MomentVenue from "@/components/moment/MomentVenue";
import { momentDateLine, momentDirectionsUrl, momentHeroImage, momentSectionId, sourceHost } from "@/components/moment/momentGuide";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { jsonLdScript } from "@/lib/seo/jsonld";

const FAIR_DAY_SLUG = "great-frederick-fair-2026";
const IN_THE_STREETS_SLUG = "in-the-street-2026";

/**
 * /moments/[slug] — a curated hub for a big county occasion (the Fourth, the
 * Fair, the holiday markets). Closed set (dynamicParams=false, prerendered from
 * CIVIC_MOMENTS), so an unknown slug is an honest 404, not a soft shell. Content
 * is hand-curated + sourced; pattern-confidence items carry a "confirm" hedge.
 *
 * The Fair and In The Streets keep their own workspaces. Every other moment
 * renders the shared template in src/components/moment: the hero picture
 * ladder (MomentHero), one date plate per day (MomentDays), sourced fact
 * tiles (MomentFacts), and the venue map with Directions as the one filled
 * action (MomentVenue), followed by sections and the FAQ as ruled rows on
 * Cream. The template draws no gradient wash, glow or eyebrow.
 */
export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return CIVIC_MOMENTS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = momentBySlug(slug);
  if (!m) notFound();
  // An owned moment photograph should lead a shared link with the actual
  // experience instead of generic civic-moment artwork.
  const ogImage = slug === FAIR_DAY_SLUG
    ? {
        url: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
        width: 1920,
        height: 1080,
        alt: "The Great Frederick Fairgrounds glowing at night, seen from above.",
      }
    : m.spotlightImage
      ? {
          url: m.spotlightImage.src,
          width: m.spotlightImage.width,
          height: m.spotlightImage.height,
          alt: m.spotlightImage.alt,
        }
    : {
        url: `/api/og?type=moment&slug=${slug}`,
        width: 1200,
        height: 630,
        alt: `${m.title} in Frederick County`,
      };
  const title = slug === FAIR_DAY_SLUG ? "Fair Day | The Great Frederick Fair 2026" : m.title;
  const description =
    slug === FAIR_DAY_SLUG
      ? "Plan tickets, arrival, the official schedule, and what you do not want to miss in one independent Frederick Radius guide."
      : m.subtitle;
  return {
    title,
    description,
    alternates: { canonical: `/moments/${slug}` },
    openGraph: { title, description, images: [ogImage] },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: ogImage.url, alt: ogImage.alt }],
    },
  };
}

const KIND_ICON: Record<MomentItemKind, typeof Sparkles> = {
  fireworks: Sparkles,
  parade: Flag,
  closure: TriangleAlert,
  activity: Star,
  tip: Info,
};

/** One source for a whole section, when every item shares it. A section
 *  whose items cite different pages keeps a link on each row instead. */
function sharedSource(items: MomentItem[]): string | null {
  const first = items[0]?.source_url;
  if (!first) return null;
  return items.every((item) => item.source_url === first) ? first : null;
}

function OfficialLink({ href, label = "Official page" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 text-meta-lg font-semibold"
      style={{ color: "var(--app-brand-press)" }}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

function Item({ item, showSource }: { item: MomentItem; showSource: boolean }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="flex gap-3 border-b py-4" style={{ borderColor: "var(--app-border)" }}>
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--app-ink-3)" }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-title-sm" style={{ color: "var(--app-ink)" }}>
            {item.title}
          </h3>
          {item.confidence === "pattern" && (
            <span
              className="rounded-full px-2 text-caption font-semibold"
              style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
            >
              Confirm the time
            </span>
          )}
        </div>
        {item.where && (
          <p className="mt-0.5 text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
            {item.where}
          </p>
        )}
        {item.when && (
          <p className="mt-1 text-meta-lg font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
            {item.when}
          </p>
        )}
        {item.note && (
          <p className="mt-1 text-body" style={{ color: "var(--app-ink-2)" }}>
            {item.note}
          </p>
        )}
        {showSource && item.source_url && <OfficialLink href={item.source_url} />}
      </div>
    </li>
  );
}

export default async function MomentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = momentBySlug(slug);
  if (!m) notFound();

  if (slug === FAIR_DAY_SLUG) {
    return <FairDayPage />;
  }
  if (slug === IN_THE_STREETS_SLUG) {
    return <InTheStreetsWorkspace />;
  }

  // The catalog record is the venue's single source of truth; the moment's
  // own coordinates are a fallback for a slug the catalog no longer carries.
  const venuePlace = m.venue ? clientPlaceBySlug(m.venue.placeSlug) : undefined;
  const venueGeom = m.venue ? (venuePlace?.geom ?? { lng: m.venue.lng, lat: m.venue.lat }) : null;
  // A venue with no car access gets walking directions to the catalog point;
  // drivers are sent to the guide's parking and shuttle section instead.
  const directionsUrl = m.venue && venueGeom
    ? m.venue.arrivalSection
      ? momentDirectionsUrl(venueGeom, { walking: true })
      : (m.spotlightDirectionsUrl ?? momentDirectionsUrl(venueGeom))
    : null;

  return (
    <article className="relative mx-auto max-w-screen-sm pb-10" data-moment-guide={m.slug}>
      <nav aria-label="Breadcrumb" className="mb-3 text-meta-lg">
        <Link href="/today" className="inline-flex min-h-11 items-center hover:underline" style={{ color: "var(--app-ink-3)" }}>
          Today
        </Link>
      </nav>

      <MomentHero
        title={m.title}
        dateLine={momentDateLine(m.days)}
        image={momentHeroImage(m)}
      />

      <div className="mt-5 space-y-3">
        <p className="max-w-[60ch] text-body-lg" style={{ color: "var(--app-ink)" }}>
          {m.intro}
        </p>
        {m.disclosure && (
          <p className="flex max-w-[60ch] items-start gap-2 text-meta-lg" style={{ color: "var(--app-ink-2)" }}>
            <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <span>{m.disclosure}</span>
          </p>
        )}
        {m.spotlightSourceUrl && (
          <OfficialLink href={m.spotlightSourceUrl} label="Official event page" />
        )}
      </div>

      {((m.days?.length ?? 0) > 0 || (m.spotlightFacts?.length ?? 0) > 0) && (
        <div className="mt-6 space-y-4">
          <MomentDays days={m.days} />
          <MomentFacts facts={m.spotlightFacts} />
        </div>
      )}

      {m.venue && venueGeom && directionsUrl && (
        <div className="mt-8">
          <MomentVenue venue={m.venue} geom={venueGeom} directionsUrl={directionsUrl} />
        </div>
      )}

      {m.weatherSensitive && (
        <p className="mt-8 flex items-start gap-2 border-t pt-4 text-meta-lg" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
          <CloudSun className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
          <span>
            This happens outdoors, so check the forecast and the organizer&rsquo;s page before you head out.{" "}
            <Link href="/pulse?open=weather" className="font-semibold underline underline-offset-2" style={{ color: "var(--app-brand-press)" }}>
              See the forecast
            </Link>
          </span>
        </p>
      )}

      <div className="mt-8 space-y-8">
        {m.sections.map((section) => {
          const source = sharedSource(section.items);
          return (
            <section key={section.heading} id={momentSectionId(section.heading)} aria-label={section.heading} className="scroll-mt-20">
              <h2 className="text-title" style={{ color: "var(--app-ink)" }}>
                {section.heading}
              </h2>
              <ul className="mt-2 border-t" style={{ borderColor: "var(--app-border)" }}>
                {section.items.map((item, i) => (
                  <Item key={i} item={item} showSource={!source} />
                ))}
              </ul>
              {source && <OfficialLink href={source} label={`From ${sourceHost(source)}`} />}
            </section>
          );
        })}

        {m.faq && m.faq.length > 0 && (
          <section aria-label="Good to know">
            <h2 className="text-title" style={{ color: "var(--app-ink)" }}>
              Good to know
            </h2>
            <dl className="mt-2 border-t" style={{ borderColor: "var(--app-border)" }}>
              {m.faq.map((f) => (
                <div key={f.q} className="border-b py-4" style={{ borderColor: "var(--app-border)" }}>
                  <dt className="text-title-sm" style={{ color: "var(--app-ink)" }}>
                    {f.q}
                  </dt>
                  <dd className="mt-1 text-body" style={{ color: "var(--app-ink-2)" }}>
                    {f.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      {m.note && (
        <p className="mt-6 text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
          {m.note}
        </p>
      )}

      {m.faq && m.faq.length > 0 && (
        <script
          type="application/ld+json"
          // FAQPage JSON-LD from the same curated Q&A rendered above, routed
          // through the hardened serializer (consistent with the app's JSON-LD
          // invariant; safe if this content ever becomes dynamic). (audit)
          dangerouslySetInnerHTML={{
            __html: jsonLdScript({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: m.faq.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }),
          }}
        />
      )}
    </article>
  );
}
