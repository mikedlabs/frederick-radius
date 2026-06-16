import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Martini } from "lucide-react";
import { placesWithFieldHappyHour, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { placesWithHappyHour } from "@/lib/loaders/businessInfo";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/happy-hour" },
  title: "Happy hour in Frederick County",
  description:
    "Where to find happy hour around Frederick County — verified schedules, confirmed at the source, with the deals and the bar-area fine print locals know.",
};

export const revalidate = 600;

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

type Row = {
  slug: string;
  name: string;
  town?: string;
  schedule: string;
  details?: string;
  sourceUrl?: string;
  verified: string | null;
};

/**
 * /happy-hour — the first surface of the Field Notes layer.
 *
 * Verified happy hours (agent-extracted + adversarially confirmed at the
 * source) lead; the legacy business-info listings fill in behind them so the
 * page is useful today. Every row attributes its source + shows when it was
 * verified, per the honesty trinity. The /today "Happy hour" button points
 * here; as the agent pipeline fills field-notes.json, this fills out.
 */
export default function HappyHourPage() {
  const townName = (slug?: string) =>
    slug ? (MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ")) : undefined;

  const verified = placesWithFieldHappyHour();
  const seen = new Set(verified.map((v) => v.slug));
  const rows: Row[] = [];

  for (const v of verified) {
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    rows.push({
      slug: v.slug,
      name: p.name,
      town: townName(p.municipality),
      schedule: v.happy_hour.schedule,
      details: v.happy_hour.details || undefined,
      sourceUrl: v.happy_hour.source_url,
      verified: verifiedLabel(v.happy_hour.last_verified),
    });
  }
  for (const l of placesWithHappyHour()) {
    if (seen.has(l.slug) || !l.happy_hour) continue;
    const p = clientPlaceBySlug(l.slug);
    if (!p) continue;
    rows.push({
      slug: l.slug,
      name: p.name,
      town: townName(p.municipality),
      schedule: l.happy_hour,
      sourceUrl: l.source?.url,
      verified: null,
    });
  }
  // Verified first, then alphabetical within each tier.
  rows.sort((a, b) => {
    if (!!a.verified !== !!b.verified) return a.verified ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="relative space-y-4">
      <PageBloom variant="warm-cool" />

      {/* Almanac nameplate, matching /events. */}
      <header className="pt-0.5">
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {rows.length} spot{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <h1
          className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]"
          style={{ color: "var(--app-ink)" }}
        >
          <Martini className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-accent)" }} aria-hidden />
          Happy hour
        </h1>
        <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Where to find a deal around the county. The ones marked verified we
          confirmed at the source. We&rsquo;re adding more all the time.
        </p>
        <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-accent)" }} />
      </header>

      {rows.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          No happy hours on file yet. They&rsquo;re coming.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const host = hostOf(r.sourceUrl);
            return (
              <li key={r.slug}>
                <article
                  className="tactile tactile-interactive relative rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3"
                  style={{
                    borderColor: "var(--app-border)",
                    boxShadow: "inset 3px 0 0 var(--app-accent), var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  }}
                >
                  <Link href={`/places/${r.slug}`} className="block outline-none">
                    <span className="absolute inset-0" aria-hidden />
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
                        {r.name}
                      </h2>
                      {r.verified ? (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums"
                          style={{ background: "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}
                        >
                          {r.verified}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                      <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-accent)" }} />
                      {r.schedule}
                    </p>
                    {r.details && (
                      <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                        {r.details}
                      </p>
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {r.town && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                          {r.town}
                        </span>
                      )}
                      {host && (
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden>·</span> via {host}
                        </span>
                      )}
                    </p>
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-1 pt-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Times change. Each spot links to its source so you can double-check
        before you go. Spot something wrong?{" "}
        <Link href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>
          Tell us
        </Link>
        .
      </p>
    </div>
  );
}
