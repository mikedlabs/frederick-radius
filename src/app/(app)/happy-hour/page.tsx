import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Martini } from "lucide-react";
import { placesWithFieldHappyHour, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { placesWithHappyHour } from "@/lib/loaders/businessInfo";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { happyHourStatus, type HHStatus } from "@/lib/happyHour";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/happy-hour" },
  title: "Happy hour in Frederick County",
  description:
    "What's on for happy hour around Frederick County right now — verified schedules confirmed at the source, with the deals and the bar-area fine print locals know.",
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
  status: HHStatus;
};

function HappyCard({ r }: { r: Row }) {
  const host = hostOf(r.sourceUrl);
  const live = r.status.state === "now";
  return (
    <article
      className="tactile tactile-interactive relative rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3"
      style={{
        borderColor: live ? "color-mix(in srgb, var(--app-accent) 45%, var(--app-border))" : "var(--app-border)",
        boxShadow: `inset 3px 0 0 var(--app-accent), var(--app-elev-1), var(--app-edge), var(--app-hi)`,
      }}
    >
      <Link href={`/places/${r.slug}`} className="block outline-none">
        <span className="absolute inset-0" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          {/* Status leads — the live read. */}
          {r.status.state === "now" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--app-accent)" }}>
              <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-accent)" }} />
              On now
            </span>
          ) : r.status.state === "today" ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
              Starts {r.status.startsAt}
            </span>
          ) : (
            <span />
          )}
          {r.verified ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums"
              style={{ background: "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}
            >
              {r.verified}
            </span>
          ) : null}
        </div>
        <h2 className="mt-1 text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
          {r.name}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
          <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-accent)" }} />
          {r.schedule}
        </p>
        {r.details && (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
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
          {host && <span className="inline-flex items-center gap-1"><span aria-hidden>·</span> via {host}</span>}
        </p>
      </Link>
    </article>
  );
}

function Band({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{title}</h2>
        <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{rows.length}</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.slug}><HappyCard r={r} /></li>
        ))}
      </ul>
    </section>
  );
}

/**
 * /happy-hour — the first Field Notes surface, time-aware.
 *
 * Bands by live status: ON RIGHT NOW → starting later today → the rest of
 * the week. Verified spots (agent-extracted + confirmed at the source) carry
 * a "verified" badge; the schedule parser decides "on now" and refuses to
 * claim it when a schedule can't be parsed (no false live badge).
 */
export default function HappyHourPage() {
  const now = new Date();
  const townName = (slug?: string) =>
    slug ? (MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ")) : undefined;

  const verified = placesWithFieldHappyHour();
  const seen = new Set(verified.map((v) => v.slug));
  const rows: Row[] = [];

  for (const v of verified) {
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    rows.push({
      slug: v.slug, name: p.name, town: townName(p.municipality),
      schedule: v.happy_hour.schedule, details: v.happy_hour.details || undefined,
      sourceUrl: v.happy_hour.source_url, verified: verifiedLabel(v.happy_hour.last_verified),
      status: happyHourStatus(v.happy_hour.schedule, now),
    });
  }
  for (const l of placesWithHappyHour()) {
    if (seen.has(l.slug) || !l.happy_hour) continue;
    const p = clientPlaceBySlug(l.slug);
    if (!p) continue;
    rows.push({
      slug: l.slug, name: p.name, town: townName(p.municipality),
      schedule: l.happy_hour, sourceUrl: l.source?.url, verified: null,
      status: happyHourStatus(l.happy_hour, now),
    });
  }

  const byVerifiedName = (a: Row, b: Row) =>
    (!!a.verified !== !!b.verified ? (a.verified ? -1 : 1) : a.name.localeCompare(b.name));
  const onNow = rows.filter((r) => r.status.state === "now").sort(byVerifiedName);
  const today = rows
    .filter((r) => r.status.state === "today")
    .sort((a, b) => byVerifiedName(a, b));
  const rest = rows.filter((r) => r.status.state === "other" || r.status.state === "unknown").sort(byVerifiedName);

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

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
          {onNow.length > 0 ? (
            <><span className="font-semibold" style={{ color: "var(--app-accent)" }}>{onNow.length} on right now.</span>{" "}The ones marked verified we confirmed at the source.</>
          ) : (
            <>Where to find a deal around the county. The ones marked verified we confirmed at the source.</>
          )}
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
        <>
          <Band title="On right now" rows={onNow} />
          <Band title="Starting later today" rows={today} />
          <Band title="Around the county" rows={rest} />
        </>
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
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
