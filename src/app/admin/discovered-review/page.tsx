import type { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  X,
  SkipForward,
  RotateCcw,
  Star,
  MapPin,
  Phone,
  Globe,
} from "lucide-react";
import {
  getCandidates,
  getDecisions,
  getStats,
  nextUndecidedIndex,
} from "@/lib/discovered-review";
import { decide } from "./actions";
import DiscoveredKeys from "./DiscoveredKeys";

export const metadata: Metadata = {
  title: "Discovered review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const photoUrl = (name: string, w = 800) =>
  `/api/place-photo?name=${encodeURIComponent(name)}&w=${w}`;

// Google enrichment websites are not guaranteed to be valid absolute URLs; a
// protocol-less or malformed value threw `new URL()` and broke that candidate's
// whole render. Fail soft to a bare host string.
const safeHost = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || url;
  }
};

export default async function DiscoveredReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  const candidates = getCandidates();
  const decisions = await getDecisions();
  const stats = getStats(candidates, decisions);
  const { i: iParam } = await searchParams;
  // Default cursor: first undecided. Explicit ?i= lets you jump.
  const rawIndex =
    iParam !== undefined ? parseInt(iParam, 10) : nextUndecidedIndex(-1, candidates, decisions);
  const index =
    Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < candidates.length
      ? rawIndex
      : nextUndecidedIndex(-1, candidates, decisions);
  const candidate = index >= 0 ? candidates[index] : null;
  const decision = candidate ? decisions[candidate.google_place_id] : undefined;
  const nextIdx = nextUndecidedIndex(index, candidates, decisions);

  const onDecide = async (formData: FormData) => {
    "use server";
    const id = String(formData.get("id") ?? "");
    const action = String(formData.get("action") ?? "");
    if (!id) return;
    if (action === "approved" || action === "rejected" || action === "clear") {
      await decide(id, action);
    }
  };

  if (!candidate) {
    return (
      <div
        className="mx-auto max-w-screen-md px-4 py-10"
        style={{ background: "var(--app-bg)" }}
      >
        <Link
          href="/admin"
          className="text-xs"
          style={{ color: "var(--app-cool)" }}
        >
          ← Admin
        </Link>
        <header className="mt-4 space-y-1">
          <p
            className="text-[11px] font-medium uppercase tracking-[0.1em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Phase 3 · merge candidates
          </p>
          <h1
            className="font-serif text-[24px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Discovered review
          </h1>
        </header>
        <div
          className="mt-6 rounded-[var(--app-radius-lg)] border p-6 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p
            className="font-serif text-[20px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            All caught up.
          </p>
          <p
            className="mx-auto mt-1 max-w-sm text-[13px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {stats.approved} approved · {stats.rejected} rejected · 0 left.
            Run <code>npm run merge:discovered</code> to build the
            Place records from approved candidates.
          </p>
        </div>
      </div>
    );
  }

  const c = candidate;
  const photo =
    c.photo_names && c.photo_names.length > 0 ? photoUrl(c.photo_names[0]) : null;
  const decided = stats.approved + stats.rejected;
  const progressPct = stats.total > 0 ? (decided / stats.total) * 100 : 0;
  const catLabel = c.detail_primary_type ?? c.primary_type ?? "place";

  return (
    <div
      className="mx-auto max-w-screen-md px-4 py-8"
      style={{ background: "var(--app-bg)" }}
    >
      <div className="flex items-center justify-between">
        <Link
          href="/admin"
          className="text-xs"
          style={{ color: "var(--app-cool)" }}
        >
          ← Admin
        </Link>
        <p
          className="text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {decided} / {stats.total} reviewed · {stats.approved} approved · {stats.rejected} rejected
        </p>
      </div>

      <header className="mt-3 space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Candidate {index + 1} of {candidates.length}
        </p>
        <h1
          className="font-serif text-[24px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Discovered review
        </h1>
      </header>

      {/* Progress bar */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--app-bg-sunken)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${progressPct}%`,
            background:
              "linear-gradient(90deg, var(--app-brand), var(--app-cool))",
          }}
        />
      </div>

      {/* Candidate card */}
      <article
        className="tactile mt-6 overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
      >
        {photo && (
          <div className="relative aspect-[16/10] w-full bg-[var(--app-bg-sunken)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <span
              className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--app-brand)" }}
            >
              {c.discovered_for?.category ?? catLabel}
            </span>
            {decision && (
              <span
                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                style={{
                  background:
                    decision === "approved"
                      ? "var(--app-positive)"
                      : "var(--app-danger)",
                }}
              >
                {decision}
              </span>
            )}
          </div>
        )}
        <div className="space-y-3 p-5">
          <div>
            <h2
              className="font-serif text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {c.name}
            </h2>
            <div
              className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                {c.address ?? "Address unknown"}
              </span>
              {typeof c.rating === "number" && (
                <span
                  className="inline-flex items-center gap-1 font-semibold tabular-nums"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  <Star
                    className="h-3 w-3"
                    strokeWidth={0}
                    fill="var(--app-warning)"
                    aria-hidden
                  />
                  {c.rating.toFixed(1)}
                  {c.user_rating_count !== undefined && (
                    <span style={{ color: "var(--app-ink-3)" }}>
                      ({c.user_rating_count.toLocaleString()})
                    </span>
                  )}
                </span>
              )}
              {c.business_status && c.business_status !== "OPERATIONAL" && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    background: "color-mix(in srgb, var(--app-warning) 18%, transparent)",
                    color: "var(--app-warning)",
                  }}
                >
                  {c.business_status.replace("_", " ").toLowerCase()}
                </span>
              )}
            </div>
          </div>

          {c.editorial_summary && (
            <p
              className="text-[14px] leading-relaxed text-pretty"
              style={{ color: "var(--app-ink-2)" }}
            >
              {c.editorial_summary}
            </p>
          )}

          {c.review_snippet && (
            <blockquote
              className="border-l-2 pl-3 text-[12px] italic leading-relaxed"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              “{c.review_snippet}”
              {c.review_author && (
                <span className="mt-1 block text-[11px] not-italic" style={{ color: "var(--app-ink-3)" }}>
                  – {c.review_author}
                </span>
              )}
            </blockquote>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="inline-flex items-center gap-1"
                style={{ color: "var(--app-cool)" }}
              >
                <Phone className="h-3 w-3" strokeWidth={2} aria-hidden />
                {c.phone}
              </a>
            )}
            {c.website && (
              <a
                href={c.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 truncate"
                style={{ color: "var(--app-cool)" }}
              >
                <Globe className="h-3 w-3" strokeWidth={2} aria-hidden />
                {safeHost(c.website)}
              </a>
            )}
            <span>· {c.municipality}</span>
            <span>· slug: <code>{c.google_place_id.slice(0, 18)}…</code></span>
          </div>
        </div>
      </article>

      {/* Decision controls. Three big buttons, one row. */}
      <form action={onDecide} className="mt-4">
        <input type="hidden" name="id" value={c.google_place_id} />
        <div className="grid grid-cols-3 gap-2">
          <button
            type="submit"
            name="action"
            value="rejected"
            formAction={async (fd) => {
              "use server";
              await onDecide(fd);
            }}
            className="tactile tactile-interactive flex items-center justify-center gap-2 rounded-[var(--app-radius-md)] py-3 text-[14px] font-semibold text-white active:scale-[0.97]"
            style={{ backgroundColor: "var(--app-danger)" }}
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Reject
          </button>
          <Link
            href={`?i=${nextIdx >= 0 ? nextIdx : index}`}
            className="tactile tactile-interactive flex items-center justify-center gap-2 rounded-[var(--app-radius-md)] py-3 text-[14px] font-semibold active:scale-[0.97]"
            style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            <SkipForward className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Skip
          </Link>
          <button
            type="submit"
            name="action"
            value="approved"
            className="tactile tactile-interactive flex items-center justify-center gap-2 rounded-[var(--app-radius-md)] py-3 text-[14px] font-semibold text-white active:scale-[0.97]"
            style={{ backgroundColor: "var(--app-positive)" }}
          >
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Approve
          </button>
        </div>
        {decision && (
          <button
            type="submit"
            name="action"
            value="clear"
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Clear this decision
          </button>
        )}
      </form>

      <DiscoveredKeys
        placeId={candidate.google_place_id}
        index={index}
        nextIndex={nextIdx}
        total={candidates.length}
      />

      <nav className="mt-4 flex items-center justify-between text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        <Link
          href={`?i=${Math.max(0, index - 1)}`}
          style={{ color: "var(--app-cool)" }}
        >
          ← Previous
        </Link>
        <span>{stats.undecided} undecided</span>
        <Link
          href={`?i=${nextIdx >= 0 ? nextIdx : index}`}
          style={{ color: "var(--app-cool)" }}
        >
          Next undecided →
        </Link>
      </nav>
    </div>
  );
}
