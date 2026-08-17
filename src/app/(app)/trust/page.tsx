import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Database, CheckCircle2, Sparkles, Users, AlertCircle } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import CostTransparency from "@/components/trust/CostTransparency";
import { publicDataSnapshot } from "@/lib/public-data-snapshot";
import { getDb } from "@/lib/db/client";
import { commerce_link_reports } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";

/**
 * /trust — the plain-English explanation of where the data comes
 * from, what the trust badges mean, and what we deliberately don't
 * do. Linked from the SourceBadge tooltips and the FreshnessChip
 * explanations so a stranger who sees "Radius reviewed" or "Checked 3 days
 * ago" can tap through and understand what the words actually mean.
 *
 * Sits inside the (app) route group so it carries the same chrome
 * as the rest of the app — feels like a settings page, not a legal
 * page. Deliberately short. If it's longer than what a person will
 * actually read on a phone, it's overbuilt.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/trust" },
  title: "Trust & data",
  description:
    "See where Frederick Radius data comes from and what its source labels mean.",
};

// The public counts are immutable for a promoted data version. Revalidation
// can update the streamed correction line, but cannot silently change those
// counts without a new reviewed release.
export const revalidate = 86_400;

const pct = (part: number, total: number): string =>
  total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;

/** Reader reports resolved as fixed — the public half of the correction
 *  loop (/admin/link-reports is the private half). Fail-soft null: a
 *  missing database must never break the trust page, and zero reports is
 *  rendered as silence, not a hollow claim.
 *
 *  The wait is BOUNDED, and that bound is load-bearing. This page is
 *  statically exported at build time, where Next allows each page 60
 *  seconds. A database that refuses a connection throws and lands in the
 *  catch below; a database that simply never answers does not, so an
 *  unbounded await silently spends the whole export budget. That is not
 *  hypothetical: every production deploy from 2c5a0e29 (2026-08-05, the
 *  commit that added this query) through e83586c2 failed here, and the
 *  app sat frozen on 2026-08-05's build for two days while ten merges
 *  reported success. A slow database now costs a missing count, which is
 *  exactly what this function already promised. */
const REPORT_COUNT_BUDGET_MS = 5_000;

async function fixedReportCount(): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const db = getDb();
    if (!db) return null;
    const query = db
      .select({ n: count() })
      .from(commerce_link_reports)
      .where(eq(commerce_link_reports.status, "fixed"));
    const rows = await Promise.race([
      query,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), REPORT_COUNT_BUDGET_MS);
      }),
    ]);
    if (!rows) return null;
    const n = rows[0]?.n ?? 0;
    return n > 0 ? n : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The one live-data line on an otherwise static page, streamed rather than
 *  prerendered. connection() opts this subtree out of static generation, so
 *  the database is never on the deploy path at all — the timeout above is
 *  now the second line of defence rather than the only one. The page shell
 *  still renders instantly from the build. */
async function FixedReportLine() {
  await connection();
  const fixedReports = await fixedReportCount();
  if (fixedReports === null) return null;
  return (
    <p
      className="mt-2 text-[14px] leading-relaxed"
      style={{ color: "var(--app-ink-2)" }}
    >
      So far, reader reports have led to{" "}
      {fixedReports.toLocaleString("en-US")} fixed{" "}
      {fixedReports === 1 ? "listing" : "listings"}.
    </p>
  );
}

export default async function TrustPage() {
  const snapshot = publicDataSnapshot();
  const placeCount = new Intl.NumberFormat("en-US").format(
    snapshot.counts.activePublicPlaces.value,
  );
  const coverage = {
    total: snapshot.counts.activePublicPlaces.value,
    mapped: snapshot.counts.mappedPlaces.value,
    hours: snapshot.counts.placesWithCurrentHours.value,
    copy: snapshot.counts.placesWithDecisionCopy.value,
    photo: snapshot.counts.placesWithPhoto.value,
    action: snapshot.counts.placesWithAction.value,
  };
  const dataVersion = snapshot.dataVersion.slice("sha256:".length, 19);
  const placePromotion = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(new Date(snapshot.counts.activePublicPlaces.asOf));
  const latestPromotion = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(new Date(snapshot.lastSuccessfulDataPromotion));
  return (
    <div className="relative space-y-6">
      <PageBloom variant="cool" />

      <header className="space-y-2">
        <p
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          Trust &amp; data
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Where the data comes from.
        </h1>
        <p
          className="text-[16px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          This page explains the difference between checked source data and
          owner-supplied details.
        </p>
      </header>

      <nav aria-label="Trust page sections" className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {[
          ["Sources", "#sources"],
          ["Badge meanings", "#badges"],
          ["Send a correction", "#corrections"],
        ].map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="tap-44-y rounded-full border px-3 py-1.5 text-[12px] font-semibold"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Where the data comes from */}
      <section
        id="sources"
        className="scroll-mt-24 rounded-[var(--app-radius-lg)] border p-5 space-y-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The sources we pull from.
        </h2>
        <ul
          className="space-y-2.5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>
            <strong style={{ color: "var(--app-ink)" }}>The place index.</strong>{" "}
            {placeCount} records in the shipped place index, assembled from business,
            government, community, and mapping sources. Automated quality checks
            and review rules screen the index; we do not claim every listing was
            individually vetted by hand.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Event feeds.</strong>{" "}
            Downtown Frederick Partnership, Celebrate Frederick, Hood College,
            Frederick County government calendar, plus ticketed listings from
            Ticketmaster, Bandsintown, and the Weinberg Center. Radius checks
            these feeds multiple times a day.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Google Places.</strong>{" "}
            Adds business status, posted hours, phone numbers, ratings, and
            photos. A source match is labeled &ldquo;Checked at source&rdquo;; it is
            not the same thing as owner verification.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Owner-claimed listings.</strong>{" "}
            An &ldquo;Owner verified&rdquo; label is reserved for a business with an
            approved, active ownership claim. A claim does not make third-party
            ratings, reviews, or older details owner-supplied.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>OpenStreetMap.</strong>{" "}
            Used for amenities such as restrooms, water fountains, EV charging,
            and bike parking. It is community-maintained mapping data and is
            labeled by source; confirm anything important before relying on it.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Resident submissions.</strong>{" "}
            Residents can send a missing place through{" "}
            <Link
              href="/submit/place"
              className="underline"
              style={{ color: "var(--app-cool)" }}
            >
              /submit/place
            </Link>
            . Radius reviews each submission before publication.
          </li>
        </ul>
      </section>

      {/* What the badges mean */}
      <section id="badges" className="scroll-mt-24 space-y-3">
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What the badges mean.
        </h2>
        <ul className="space-y-3">
          {BADGES.map((b) => (
            <li
              key={b.label}
              className="flex items-start gap-3 rounded-[var(--app-radius-md)] border p-4"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
              }}
            >
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${b.color} 14%, transparent)`,
                  color: b.color,
                }}
                aria-hidden
              >
                <b.icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  {b.label}
                </p>
                <p
                  className="mt-0.5 text-[13px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {b.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Freshness */}
      <section
        className="rounded-[var(--app-radius-lg)] border p-5 space-y-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What &ldquo;Checked at source&rdquo; means.
        </h2>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          A small chip records when Radius last checked available source details.
          &ldquo;Checked at source · 3d ago&rdquo; is recent, while &ldquo;Last checked Mar
          2025&rdquo; is stale. The chip does not mean the owner supplied or approved
          the listing. &ldquo;Owner verified&rdquo; is reserved for an approved active claim.
        </p>
      </section>

      {/* The measured state of the data — the same numbers the internal
          coverage board runs, so the page proves what it claims. Honest
          about gaps by construction: a low number renders as a low number. */}
      <section
        className="rounded-[var(--app-radius-lg)] border p-5 space-y-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The state of the data, measured.
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Active data release <code>{dataVersion}</code>. The latest successful
          promotion was {latestPromotion}.
        </p>
        <ul
          className="space-y-2.5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Mapped.</strong>{" "}
            {coverage.mapped.toLocaleString("en-US")} of{" "}
            {coverage.total.toLocaleString("en-US")} public places have usable
            coordinates.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Hours.</strong>{" "}
            {coverage.hours > 0 ? (
              <>
                {coverage.hours.toLocaleString("en-US")} of{" "}
                {coverage.total.toLocaleString("en-US")} places (
                {pct(coverage.hours, coverage.total)}) carry posted hours fresh
                enough for an open-now answer. Everywhere else the app says it
                does not know instead of guessing.
              </>
            ) : (
              // Counted at the moment you load this page, not when the data was
              // promoted. A posted schedule stops backing an open-now answer
              // seven days after it was last checked, so this figure reaches
              // zero if a refresh is not published for a week. Saying that
              // plainly is the point of this page.
              <>
                No place currently carries hours checked recently enough to
                back an open-now answer, so the app is saying it does not know
                everywhere instead of guessing. A posted schedule stops
                counting seven days after it was last verified, and the
                published snapshot is now older than that.
              </>
            )}
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Decision copy.</strong>{" "}
            {coverage.copy.toLocaleString("en-US")} places ({pct(coverage.copy, coverage.total)})
            carry specific, publishable copy that passed the shipped quality rules.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Photos.</strong>{" "}
            {coverage.photo.toLocaleString("en-US")} places (
            {pct(coverage.photo, coverage.total)}) carry a real photo from the
            venue or its source listing.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>A way to act.</strong>{" "}
            {coverage.action.toLocaleString("en-US")} places (
            {pct(coverage.action, coverage.total)}) carry a direct phone,
            website, menu, ordering, or reservation detail stored with the
            record.
          </li>
        </ul>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          Place figures were measured from the shipped index when it was
          promoted on {placePromotion}. Upcoming-event and source-health totals
          are not shown because those runtime-only facts are not yet part of
          the promoted snapshot.
        </p>
      </section>

      {/* What we don't do */}
      <section
        className="rounded-[var(--app-radius-lg)] border-l-4 p-5 space-y-2"
        style={{
          borderColor: "var(--app-warning)",
          background:
            "color-mix(in srgb, var(--app-warning) 4%, var(--app-bg-elevated))",
        }}
      >
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-warning)" }}
        >
          <AlertCircle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          What we don&apos;t do
        </p>
        <ul
          className="space-y-1.5 text-[14px] leading-relaxed pt-1"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>We don&apos;t invent hours when we don&apos;t know them.</li>
          <li>We don&apos;t show a rating we can&apos;t source.</li>
          <li>We don&apos;t auto-fill descriptions from a scraping engine.</li>
          <li>We don&apos;t accept paid placement.</li>
          <li>We don&apos;t pretend to be the county government.</li>
        </ul>
      </section>

      {/* Found something wrong */}
      <section
        id="corrections"
        className="scroll-mt-24 rounded-[var(--app-radius-lg)] border p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[18px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Find something wrong?
        </h2>
        <p
          className="mt-2 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Email{" "}
          <a
            href="mailto:hello@frederickradius.app"
            className="underline"
            style={{ color: "var(--app-cool)" }}
          >
            hello@frederickradius.app
          </a>{" "}
          with what you saw and where, or use the report option beside a
          place&apos;s ordering and menu links. We review correction messages
          and update records by hand.
        </p>
        <Suspense fallback={null}>
          <FixedReportLine />
        </Suspense>
      </section>

      {/* What it cost to build — the no-ads, no-investors civic read. */}
      <CostTransparency />

      <p
        className="pt-2 text-center text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Frederick Radius is made locally in Frederick, Maryland, and is independent of local government.
      </p>
    </div>
  );
}

const BADGES: Array<{
  label: string;
  color: string;
  icon: typeof Sparkles;
  body: string;
}> = [
  {
    label: "Radius reviewed",
    color: "var(--app-brand-press)",
    icon: Sparkles,
    body: "Selected or edited in Frederick Radius. Current facts may still combine multiple sources and can change.",
  },
  {
    label: "Checked at source",
    color: "var(--app-positive)",
    icon: CheckCircle2,
    body: "Basic details were matched or checked against the named source, with a checked-on date where available. This is not owner verification.",
  },
  {
    label: "Owner verified",
    color: "var(--app-positive)",
    icon: CheckCircle2,
    body: "Reserved for a business with an approved, active ownership claim. It applies to owner-managed details, not third-party ratings or reviews.",
  },
  {
    label: "Community source",
    color: "var(--app-cool)",
    icon: Users,
    body: "Submitted by a local or assembled from a public community or mapping source. Check important details with the linked source.",
  },
  {
    label: "Official source",
    color: "var(--app-civic)",
    icon: Database,
    body: "Imported from a government source. Frederick Radius may normalize or summarize it. The source agency does not operate or endorse this app; check the linked source for the current official record.",
  },
];
