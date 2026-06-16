import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Martini } from "lucide-react";
import { placesWithFieldHappyHour, fieldNotesFor, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { happyHourStatus, type HHStatus } from "@/lib/happyHour";
import PageBloom from "@/components/ui/PageBloom";
import FieldStamp from "@/components/ui/FieldStamp";

export const metadata: Metadata = {
  alternates: { canonical: "/happy-hour" },
  title: "Happy hour in Frederick County",
  description:
    "What's on for happy hour around Frederick County right now — verified schedules confirmed at the source, with the deal, where to park, and the fine print locals know.",
};

export const revalidate = 600;

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

type Row = {
  slug: string;
  name: string;
  town?: string;
  schedule: string;
  deal?: string;
  parking?: string;
  note?: string;
  sourceUrl?: string;
  verified: string | null;
  photo?: string;
  status: HHStatus;
};

/** A labeled field-guide note line — the almanac-annotation look: a fixed
 *  mono label column + the value. The scan targets get weight: `accent`
 *  (WHEN) is bold ink, `strong` (DEAL) is medium ink; PARK/NOTE stay quiet
 *  ink-2 so the eye lands on the time + the deal first. */
function NoteLine({ label, children, accent, strong, mono, clamp }: {
  label: string; children: React.ReactNode; accent?: boolean; strong?: boolean; mono?: boolean; clamp?: 1 | 2;
}) {
  const valColor = accent || strong ? "var(--app-ink)" : "var(--app-ink-2)";
  const weight = accent ? "font-semibold" : strong ? "font-medium" : "";
  return (
    <div className="flex gap-3">
      <span
        className="w-[50px] shrink-0 pt-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.09em]"
        style={{ color: accent ? "var(--app-accent)" : "var(--app-ink-3)" }}
      >
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 text-[12.5px] leading-snug ${weight} ${mono ? "font-mono tabular-nums" : ""} ${clamp === 1 ? "line-clamp-1" : clamp === 2 ? "line-clamp-2" : ""}`}
        style={{ color: valColor }}
      >
        {children}
      </span>
    </div>
  );
}

function OnNowBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white"
      style={{ background: "var(--app-brand)", boxShadow: "0 2px 8px -2px color-mix(in srgb, var(--app-brand) 60%, transparent)" }}
    >
      <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
      On now
    </span>
  );
}

/** The town, as a scannable chip — WHERE is a per-card detail, never a band
 *  label. `onDark` for use over a photo. */
function TownChip({ town, onDark }: { town?: string; onDark?: boolean }) {
  if (!town) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.07em]"
      style={
        onDark
          ? { background: "rgba(20,16,12,0.55)", color: "#fff" }
          : { background: "color-mix(in srgb, var(--app-ink) 8%, transparent)", color: "var(--app-ink-2)" }
      }
    >
      <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: "currentColor", opacity: 0.7 }} />
      {town}
    </span>
  );
}

function PhotoFallback({ rounded }: { rounded?: string }) {
  return (
    <div
      aria-hidden
      className="grid h-full w-full place-items-center"
      style={{ borderRadius: rounded, background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 28%, var(--app-brand-2)) 0%, var(--app-brand-2) 70%)" }}
    >
      <Martini className="h-7 w-7" strokeWidth={1.75} style={{ color: "color-mix(in srgb, var(--app-accent) 60%, #fff)" }} />
    </div>
  );
}

function Footer({ town, host, verified }: { town?: string; host?: string; verified?: string | null }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
      {town && <span>{town}</span>}
      {host && <><span aria-hidden>·</span><span>via {host}</span></>}
      {verified && <><span aria-hidden>·</span><span style={{ color: "var(--app-positive)" }}>{verified}</span></>}
    </p>
  );
}

/** Big photo-led field-guide entry for spots that are ON NOW. */
function HappyFeature({ r }: { r: Row }) {
  const host = hostOf(r.sourceUrl);
  return (
    <article
      className="tactile tactile-interactive relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "color-mix(in srgb, var(--app-brand) 35%, var(--app-border))", boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)" }}
    >
      <Link href={`/places/${r.slug}`} className="block outline-none">
        <span className="absolute inset-0 z-20" aria-hidden />
        <div className="relative h-[148px] w-full">
          {r.photo ? <Image src={r.photo} alt="" fill sizes="(max-width:720px) 100vw, 680px" className="object-cover" /> : <PhotoFallback />}
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(16,12,10,0.80) 0%, rgba(16,12,10,0.10) 46%, rgba(16,12,10,0.20) 100%)" }} />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <OnNowBadge />
            <TownChip town={r.town} onDark />
          </div>
          <h2 className="absolute inset-x-0 bottom-0 p-3 font-serif text-[21px] font-semibold leading-tight tracking-tight text-white">
            {r.name}
          </h2>
        </div>
        <div className="space-y-1.5 p-3.5">
          <NoteLine label="When" accent mono clamp={2}>{r.schedule}</NoteLine>
          {r.deal && <NoteLine label="Deal" strong clamp={2}>{r.deal}</NoteLine>}
          {r.parking && <NoteLine label="Park" clamp={2}>{r.parking}</NoteLine>}
          {r.note && <NoteLine label="Note" clamp={2}>{r.note}</NoteLine>}
          <div className="pt-1.5" style={{ borderTop: "1px solid var(--app-border)" }} />
          <Footer host={host} verified={r.verified} />
        </div>
      </Link>
    </article>
  );
}

/** Compact photo-thumb field-guide row for everything else. */
function HappyRow({ r }: { r: Row }) {
  const host = hostOf(r.sourceUrl);
  return (
    <article
      className="tactile tactile-interactive relative flex gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <Link href={`/places/${r.slug}`} className="block outline-none"><span className="absolute inset-0" aria-hidden /></Link>
      <div className="relative h-[92px] w-[78px] shrink-0 overflow-hidden rounded-[12px]">
        {r.photo ? <Image src={r.photo} alt="" fill sizes="78px" className="object-cover" /> : <PhotoFallback rounded="12px" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[14.5px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>{r.name}</h2>
          {r.status.state === "today" ? (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-accent)" }}>{r.status.startsAt}</span>
          ) : r.verified ? (
            <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] tabular-nums" style={{ background: "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}>verified</span>
          ) : null}
        </div>
        <TownChip town={r.town} />
        <NoteLine label="When" accent mono clamp={1}>{r.schedule}</NoteLine>
        {r.deal && <NoteLine label="Deal" strong clamp={1}>{r.deal}</NoteLine>}
        <Footer host={host} />
      </div>
    </article>
  );
}

function Band({ title, rows, feature }: { title: string; rows: Row[]; feature?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{title}</h2>
        <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{rows.length}</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (<li key={r.slug}>{feature ? <HappyFeature r={r} /> : <HappyRow r={r} />}</li>))}
      </ul>
    </section>
  );
}

/**
 * /happy-hour — the Field Notes flagship: each spot is a premium field-guide
 * ENTRY (labeled WHEN / DEAL / PARK / NOTE note-lines, almanac-style), led by
 * what's ON NOW as big venue-photo cards. Surfaces the agent-extracted deal +
 * parking + insider note, not just the schedule. Verified = confirmed at the
 * source; the parser refuses a false "on now".
 */
export default function HappyHourPage() {
  const now = new Date();
  const townName = (slug?: string) => slug ? (MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ")) : undefined;

  const verified = placesWithFieldHappyHour();
  const rows: Row[] = [];

  for (const v of verified) {
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    const fn = fieldNotesFor(v.slug);
    rows.push({
      slug: v.slug, name: p.name, town: townName(p.municipality), photo: p.google_photo_url,
      schedule: v.happy_hour.schedule, deal: v.happy_hour.details || undefined,
      parking: fn?.parking?.text, note: fn?.insider?.[0]?.text,
      sourceUrl: v.happy_hour.source_url, verified: verifiedLabel(v.happy_hour.last_verified),
      status: happyHourStatus(v.happy_hour.schedule, now),
    });
  }
  // VERIFIED ONLY: the unverified legacy business-info happy hours were
  // dropped — they carried stale-name / duplicate problems (e.g. "Jraymonds
  // Steakhouse", the old name of Wye Oak Tavern). Everything on this page is
  // now agent-confirmed at the source. The Field Notes pipeline grows it.

  const byVerifiedName = (a: Row, b: Row) => (!!a.verified !== !!b.verified ? (a.verified ? -1 : 1) : a.name.localeCompare(b.name));
  const onNow = rows.filter((r) => r.status.state === "now").sort(byVerifiedName);
  const today = rows.filter((r) => r.status.state === "today").sort(byVerifiedName);
  const rest = rows.filter((r) => r.status.state === "other" || r.status.state === "unknown").sort(byVerifiedName);

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="pt-0.5">
        <div aria-hidden className="h-px" style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }} />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>Frederick County</span>
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>{rows.length} spot{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
              <Martini className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-accent)" }} aria-hidden />
              Happy hour
            </h1>
            <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              {onNow.length > 0 ? (
                <><span className="font-semibold" style={{ color: "var(--app-brand)" }}>{onNow.length} on right now.</span>{" "}The deal, where to park, and what locals know. Verified means confirmed at the source.</>
              ) : (
                <>The deal, where to park, and what locals know — around the county. Verified means confirmed at the source.</>
              )}
            </p>
            <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-accent)" }} />
          </div>
          {/* The page's certification mark — a field-guide rubber stamp that
              says the whole layer is source-verified (the moat). Decorative;
              the "verified" promise is also stated in the copy + per card. */}
          <FieldStamp id="hh" top="VERIFIED AT SOURCE" bottom="FIELD NOTES" size={80} className="mt-0.5" />
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No happy hours on file yet. They&rsquo;re coming.
        </p>
      ) : (
        <>
          <Band title="On right now" rows={onNow} feature />
          <Band title="Starting later today" rows={today} />
          <Band title="On other days" rows={rest} />
        </>
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Times change. Each spot links to its source so you can double-check before you go. Spot something wrong?{" "}
        <Link href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>Tell us</Link>.
      </p>
    </div>
  );
}
