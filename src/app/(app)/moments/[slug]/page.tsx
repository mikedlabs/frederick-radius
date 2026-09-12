import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, Flag, TriangleAlert, Star, Info, ExternalLink, CloudSun } from "lucide-react";
import { CIVIC_MOMENTS, momentBySlug, type MomentItem, type MomentItemKind } from "@/data/civic-moments";
import FairDayPage from "@/components/fair/FairDayPage";
import PageBloom from "@/components/ui/PageBloom";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { easternDayKey } from "@/lib/tz";

const FAIR_DAY_SLUG = "great-frederick-fair-2026";

/**
 * /moments/[slug] — a curated hub for a big county occasion (the Fourth, the
 * Fair, the holiday markets). Closed set (dynamicParams=false, prerendered from
 * CIVIC_MOMENTS), so an unknown slug is an honest 404, not a soft shell. Content
 * is hand-curated + sourced; pattern-confidence items carry a "confirm" hedge.
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
  // The Fair has a distinctive owned photograph, so a shared link should lead
  // with the actual experience instead of the generic civic-moment card. Other
  // moments keep the generated field-guide artwork.
  const ogImage = slug === FAIR_DAY_SLUG
    ? {
        url: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
        width: 1920,
        height: 1080,
        alt: "The Great Frederick Fairgrounds glowing at night, seen from above.",
      }
    : {
        url: `/api/og?type=moment&slug=${slug}`,
        width: 1200,
        height: 630,
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
    twitter: { card: "summary_large_image", title, description, images: [ogImage.url] },
  };
}

const KIND_ICON: Record<MomentItemKind, typeof Sparkles> = {
  fireworks: Sparkles,
  parade: Flag,
  closure: TriangleAlert,
  activity: Star,
  tip: Info,
};

function Item({ item, accent }: { item: MomentItem; accent: string }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="flex gap-3 py-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="font-serif text-[16px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {item.title}
          </h3>
          {item.confidence === "pattern" && (
            <span className="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider" style={{ background: "var(--app-ink-tint-6)", color: "var(--app-ink-3)" }}>
              Confirm time
            </span>
          )}
        </div>
        {item.where && (
          <p className="font-mono text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            {item.where}
          </p>
        )}
        {item.when && (
          <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--app-ink)" }}>
            {item.when}
          </p>
        )}
        {item.note && (
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {item.note}
          </p>
        )}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Official page
            <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

export default async function MomentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = momentBySlug(slug);
  if (!m) notFound();
  const isDayOf = easternDayKey(new Date()) === m.ends;

  if (slug === FAIR_DAY_SLUG) {
    return <FairDayPage />;
  }

  return (
    <div className="relative mx-auto max-w-screen-sm space-y-6 pb-10">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link href="/today" className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline" style={{ color: "var(--app-ink-3)" }}>
          Today
        </Link>
      </nav>

      {/* Hero */}
      <header
        className="relative overflow-hidden rounded-[var(--app-radius-xl)] border p-6"
        style={{
          borderColor: `color-mix(in srgb, ${m.accent} 40%, var(--app-border))`,
          background: `linear-gradient(140deg, color-mix(in srgb, ${m.accent} 14%, var(--app-bg-elevated-solid)), color-mix(in srgb, var(--app-accent) 10%, var(--app-bg-elevated-solid)))`,
        }}
      >
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${m.accent} 22%, transparent), transparent 70%)` }} />
        <p className="relative inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: m.accent }}>
          <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          {isDayOf ? "Today in Frederick County" : "This weekend in Frederick County"}
        </p>
        <h1 className="relative mt-2 font-serif font-semibold leading-[1.02] tracking-tight" style={{ color: "var(--app-ink)", fontSize: "clamp(28px, 7vw, 40px)" }}>
          {m.title}
        </h1>
        {m.disclosure && (
          <p
            className="relative mt-3 flex items-start gap-2 rounded-[var(--app-radius-md)] border px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed"
            style={{
              borderColor: `color-mix(in srgb, ${m.accent} 38%, var(--app-border))`,
              background: "var(--app-bg-elevated-solid)",
              color: "var(--app-ink)",
            }}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: m.accent }} aria-hidden />
            <span>{m.disclosure}</span>
          </p>
        )}
        <p className="relative mt-2 max-w-[40ch] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {m.intro}
        </p>
        {m.spotlightFacts && m.spotlightFacts.length > 0 && (
          <dl className="relative mt-5 grid gap-px overflow-hidden rounded-[var(--app-radius-md)] border sm:grid-cols-3" style={{ borderColor: "color-mix(in srgb, var(--app-ink) 14%, var(--app-border))", background: "color-mix(in srgb, var(--app-ink) 8%, transparent)" }}>
            {m.spotlightFacts.map((fact) => (
              <div key={fact.label} className="px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)" }}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>{fact.label}</dt>
                <dd className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {m.spotlightSourceUrl && (
          <a href={m.spotlightSourceUrl} target="_blank" rel="noopener noreferrer" className="relative mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3.5 text-[13px] font-semibold" style={{ background: "var(--app-brand)", color: "var(--app-bg)" }}>
            Official event details
            <ExternalLink className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </a>
        )}
      </header>

      {m.weatherSensitive && (
        <p className="flex items-center gap-2 rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-[12.5px]" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}>
          <CloudSun className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          These are outdoor and weather-dependent. Check the sky and the organizer&rsquo;s page before you head out.
        </p>
      )}

      {m.sections.map((section) => (
        <section key={section.heading}>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: m.accent }}>
            {section.heading}
          </h2>
          <ul className="mt-1 divide-y" style={{ borderColor: "var(--app-border)" }}>
            {section.items.map((item, i) => (
              <Item key={i} item={item} accent={m.accent} />
            ))}
          </ul>
        </section>
      ))}

      {m.faq && m.faq.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: m.accent }}>
            Good to know
          </h2>
          <dl className="mt-1 divide-y" style={{ borderColor: "var(--app-border)" }}>
            {m.faq.map((f) => (
              <div key={f.q} className="py-3">
                <dt className="font-serif text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {f.q}
                </dt>
                <dd className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {m.note && (
        <p className="rounded-[var(--app-radius-md)] px-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
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
    </div>
  );
}
