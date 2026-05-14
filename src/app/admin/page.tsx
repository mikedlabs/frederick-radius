import type { Metadata } from "next";
import Link from "next/link";
import { PLACES } from "@/data/places";
import { EVENTS } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES } from "@/data/categories";

export const metadata: Metadata = {
  title: "Admin · Frederick Radius",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminHome() {
  const totals = {
    places: PLACES.length,
    operational: PLACES.filter((p) => p.is_operational === "operational").length,
    needs_verification: PLACES.filter((p) => !p.is_operational || p.is_operational === "needs_verification").length,
    events: EVENTS.length,
    municipalities: MUNICIPALITIES.length,
    categories: CATEGORIES.length,
  };

  const hasGooglePlaces = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const hasYelp = Boolean(process.env.YELP_API_KEY);
  const hasAirnow = Boolean(process.env.AIRNOW_API_KEY);
  const hasNps = Boolean(process.env.NPS_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasReddit = Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
  const hasDb = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/" className="text-xs" style={{ color: "var(--app-cool)" }}>← Back to Frederick Radius</Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Operations dashboard
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Admin
        </h1>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Places" value={totals.places} />
        <Stat label="Operational" value={totals.operational} tone="positive" />
        <Stat label="Need verify" value={totals.needs_verification} tone="warning" />
        <Stat label="Events (seed)" value={totals.events} />
        <Stat label="Municipalities" value={totals.municipalities} />
        <Stat label="Categories" value={totals.categories} />
      </section>

      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Data sources
        </h2>
        <ul className="space-y-1.5">
          <SourceRow label="Supabase Postgres (recommended)" wired={hasDb} setupDoc="TOOLS.md" purpose="DB + auth + storage + realtime + pgvector. Switch from Neon — see TOOLS.md." />
          <SourceRow label="Google Places API" wired={hasGooglePlaces} setupDoc="GOOGLE_PLACES_API.md" purpose="Authoritative operational status, hours, ratings, photos." />
          <SourceRow label="Yelp Fusion" wired={hasYelp} setupDoc="SETUP_KEYS.md" purpose="Backup hours + reviews enrichment." />
          <SourceRow label="AirNow AQI" wired={hasAirnow} setupDoc="SETUP_KEYS.md" purpose="Real-time air-quality badge on Today." />
          <SourceRow label="NPS API" wired={hasNps} setupDoc="SETUP_KEYS.md" purpose="Catoctin / Monocacy / C&O alerts + events." />
          <SourceRow label="Anthropic Claude" wired={hasAnthropic} setupDoc="VERCEL_MARKETPLACE.md" purpose="Plan-my-evening narrative + future grounded recommendations." />
          <SourceRow label="Resend" wired={hasResend} setupDoc="SETUP_KEYS.md" purpose="Admin notifications for submissions; transactional email later." />
          <SourceRow label="Reddit OAuth2" wired={hasReddit} setupDoc="TOOLS.md" purpose="r/Frederick community pulse on Today (Reddit locked down anon access in 2024)." />
        </ul>
      </section>

      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ActionTile href="/submit/place" title="Submit a place" desc="Public submission form" />
          <ActionTile href="/submit/event" title="Submit an event" desc="Public submission form" />
          <ActionTile href="/map" title="Open the map" desc="Curated + OSM businesses" />
          <ActionTile href="/plan" title="Plan my evening" desc="Itinerary builder" />
        </div>
      </section>

      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Curated places — operational status
        </h2>
        <ul className="space-y-1">
          {PLACES.map((p) => (
            <li key={p.slug}
                className="flex items-center justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2 text-sm"
                style={{ borderColor: "var(--app-border)" }}>
              <Link href={`/places/${p.slug}`} className="truncate" style={{ color: "var(--app-ink)" }}>
                {p.name}
              </Link>
              <span className="ml-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide"
                    style={{ color: statusColor(p.is_operational) }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: statusColor(p.is_operational) }} aria-hidden />
                {statusLabel(p.is_operational)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        This page is currently public-but-no-indexed. Once Auth.js is wired, it&apos;ll require an admin email
        on the `ADMIN_EMAILS` allowlist. Submission queue + ingest run history land here when Neon Postgres
        is connected.
      </p>
    </div>
  );
}

function statusColor(s: string | undefined): string {
  switch (s) {
    case "operational": return "var(--app-positive)";
    case "needs_verification": return "var(--app-warning)";
    case "closed_temporarily": return "var(--app-warning)";
    case "closed_permanently": return "var(--app-danger)";
    default: return "var(--app-ink-3)";
  }
}

function statusLabel(s: string | undefined): string {
  switch (s) {
    case "operational": return "OK";
    case "needs_verification": return "Verify";
    case "closed_temporarily": return "Temp closed";
    case "closed_permanently": return "Closed";
    default: return "Unknown";
  }
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "positive" | "warning" }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning)" : "var(--app-ink)";
  return (
    <div className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center"
         style={{ borderColor: "var(--app-border)" }}>
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>{label}</p>
    </div>
  );
}

function SourceRow({ label, wired, setupDoc, purpose }: { label: string; wired: boolean; setupDoc: string; purpose: string }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-sm"
        style={{ borderColor: "var(--app-border)" }}>
      <div className="min-w-0 flex-1">
        <p className="font-medium" style={{ color: "var(--app-ink)" }}>{label}</p>
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{purpose}</p>
      </div>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: wired ? `${"#1E6B3A"}1F` : `${"#B26B00"}1F`,
              color: wired ? "var(--app-positive)" : "var(--app-warning)",
            }}>
        {wired ? "Wired" : `See ${setupDoc}`}
      </span>
    </li>
  );
}

function ActionTile({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}
          className="block rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)" }}>
      <p className="font-semibold" style={{ color: "var(--app-ink)" }}>{title}</p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>{desc}</p>
    </Link>
  );
}
