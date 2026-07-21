import type { Metadata } from "next";
import { Suspense } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Inbox, Flag, PenLine, Copy as CopyIcon, GitCompare, Sparkles,
  BarChart3, LayoutDashboard, KeyRound, Mail, Megaphone,
  Activity, MapPinned, Receipt, StickyNote, MapPin, Truck,
} from "lucide-react";
import Link from "next/link";
import { easternDayKey } from "@/lib/tz";
import { DeskSections, DeskSkeleton, TrafficGlance, GlanceSkeleton } from "./desk";

/**
 * /admin — the operations desk.
 *
 * The old home was an inventory (stats, a 300-row place list, a duplicate
 * of the feed board). A solo operator at 7 AM needs one answer: what needs
 * me today? So the desk leads with an action QUEUE (rows exist only when
 * something is actually waiting), then the beta pulse, a traffic glance,
 * and a SYSTEM board (ingest heartbeat, dataset freshness, spend, field
 * collection). Deep inventories still live one tap away.
 *
 * Speed model (owner ask, Jul 2026 "make it faster"): this file is the
 * static shell — header, build stamp, keys, doors — and it flushes
 * immediately. The two data blocks stream in behind Suspense from
 * ./desk: DeskSections holds every Postgres read (three consolidated
 * statements, awaited sequentially for the Supavisor max:1 pool) and
 * TrafficGlance reads Plausible in parallel because it never touches
 * that connection. Every read fails soft: without a database or keys the
 * section says so quietly and the rest of the desk stands.
 */

export const metadata: Metadata = {
  // Root layout's metadata.title.template adds " · Frederick Radius";
  // including it here would double-suffix.
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The doors, grouped by what the owner is there to do: act on people's
// input, tend the audience, or tend the data. One flat 15-tile wall made
// every trip a scan; three labeled shelves make it a reach.
const DOOR_GROUPS: { label: string; doors: { href: string; title: string; icon: LucideIcon }[] }[] = [
  {
    label: "Review",
    doors: [
      { href: "/admin/claims", title: "Submissions", icon: Inbox },
      { href: "/admin/reports", title: "Reports", icon: Flag },
      { href: "/admin/food-trucks", title: "Truck claims", icon: Truck },
      { href: "/admin/dear-frederick", title: "Letters", icon: Mail },
      { href: "/admin/copy-review", title: "Copy", icon: PenLine },
      { href: "/admin/dedup-review", title: "Dedup", icon: CopyIcon },
      { href: "/admin/drift-review", title: "Drift", icon: GitCompare },
      { href: "/admin/discovered-review", title: "Discovered", icon: Sparkles },
    ],
  },
  {
    label: "Audience",
    doors: [
      { href: "/admin/traffic", title: "Traffic", icon: BarChart3 },
      { href: "/admin/beta", title: "Beta", icon: LayoutDashboard },
      { href: "/admin/beta-codes", title: "Codes", icon: KeyRound },
      { href: "/admin/beta-emails", title: "Emails", icon: Mail },
      { href: "/admin/notify", title: "Broadcast", icon: Megaphone },
    ],
  },
  {
    label: "Data & field",
    doors: [
      { href: "/admin/data-health", title: "Data health", icon: Activity },
      { href: "/admin/coverage", title: "Coverage", icon: MapPinned },
      { href: "/admin/costs", title: "Costs", icon: Receipt },
      { href: "/admin/field-notes", title: "Field notes", icon: StickyNote },
      { href: "/collect", title: "Collect", icon: MapPin },
    ],
  },
];

export default function AdminDesk() {
  return (
    <main className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/" className="tap-44 inline-flex items-center text-xs" style={{ color: "var(--app-cool)" }}>← Back to Frederick Radius</Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Operations desk
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          What needs you
        </h1>
      </header>

      <BuildStamp />

      {/* Queue + vitals + system stream in as one block: one component so
          its DB awaits stay sequential over the max:1 pooled connection. */}
      <Suspense fallback={<DeskSkeleton />}>
        <DeskSections />
      </Suspense>

      {/* Plausible streams independently — external API, no pool involved,
          so it resolves alongside the DB block instead of after it. */}
      <Suspense fallback={<GlanceSkeleton />}>
        <TrafficGlance />
      </Suspense>

      {/* ── Keys & switches — what's wired in THIS deployment. ── */}
      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Keys & switches</h2>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          <KeyChip label="Database" on={Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL)} />
          <KeyChip label="Rate limits (KV)" on={Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)} />
          <KeyChip label="Google Places" on={Boolean(process.env.GOOGLE_PLACES_API_KEY)} />
          <KeyChip label="Anthropic" on={Boolean(process.env.ANTHROPIC_API_KEY)} />
          <KeyChip label="Eventbrite" on={Boolean(process.env.EVENTBRITE_TOKEN)} />
          <KeyChip label="Ticketmaster" on={Boolean(process.env.TICKETMASTER_API_KEY)} />
          <KeyChip label="Blob storage" on={Boolean(process.env.BLOB_READ_WRITE_TOKEN)} />
          <KeyChip label="Resend email" on={Boolean(process.env.RESEND_API_KEY)} />
          <KeyChip label="Beta wall" on={Boolean(process.env.BETA_PASSWORD)} />
          {/* Two lights on purpose: the tracker (public, collects) and the
              Stats API (server, reads back) turn on independently. */}
          <KeyChip label="Plausible tracker" on={Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN)} />
          <KeyChip label="Plausible stats" on={Boolean(process.env.PLAUSIBLE_API_KEY && process.env.PLAUSIBLE_SITE_ID)} />
        </div>
      </section>

      {/* ── Doors, on three labeled shelves. ── */}
      <section className="mt-7 space-y-4">
        {DOOR_GROUPS.map((g) => (
          <div key={g.label} className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{g.label}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.doors.map((d) => (
                <ActionTile key={d.href} href={d.href} title={d.title} icon={d.icon} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Rendered fresh on every request. Gated by HTTP Basic Auth in
        middleware; unreachable unless ADMIN_USER and ADMIN_PASSWORD are set.
      </p>
    </main>
  );
}

function KeyChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-between rounded-full border px-3 py-1.5 text-[11.5px] font-medium"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
    >
      {label}
      <span
        aria-hidden
        className="ml-2 inline-block h-2 w-2 rounded-full"
        style={{ background: on ? "var(--app-positive)" : "var(--app-warning)" }}
      />
    </span>
  );
}

/**
 * BuildStamp — which build is live, and what the server thinks "today" is.
 * Force-dynamic, so a stale prod build or a wrong server clock is visible
 * on sight (this page's oldest and still most-used trick).
 */
function BuildStamp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const renderedAt = new Date();
  const easternDay = easternDayKey(renderedAt);
  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--app-radius-md)] border px-3 py-2 text-[11px]"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-3)" }}
    >
      <span>
        <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Build</span>{" "}
        <code>{sha ? sha.slice(0, 12) : "dev (local / no Vercel SHA)"}</code>
        {ref ? <span> · {ref}</span> : null}
      </span>
      <span aria-hidden>·</span>
      <span>
        <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Eastern day</span> {easternDay}
      </span>
      <span aria-hidden>·</span>
      <span>
        <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Rendered</span>{" "}
        <code>{renderedAt.toISOString()}</code>
      </span>
    </div>
  );
}

function ActionTile({ href, title, icon: Icon }: { href: string; title: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="tap-44 flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-2 py-3.5 text-center transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--app-brand-2) 12%, transparent)" }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} />
      </span>
      <span className="text-[12px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{title}</span>
    </Link>
  );
}
