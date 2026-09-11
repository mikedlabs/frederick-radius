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
import {
  AdminShell,
  AdminButton,
  ProgressBar,
  Tag,
  StatusPill,
  AllClear,
} from "@/components/admin/kit";
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
  const decided = stats.approved + stats.rejected;

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
      <AdminShell title="Discovered review" eyebrow="Phase 3 · merge candidates">
        <div className="mt-6">
          <AllClear>All caught up.</AllClear>
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            {stats.approved} approved · {stats.rejected} rejected · 0 left. Run{" "}
            <code>npm run merge:discovered</code> to build the Place records from approved
            candidates.
          </p>
        </div>
      </AdminShell>
    );
  }

  const c = candidate;
  const photo =
    c.photo_names && c.photo_names.length > 0 ? photoUrl(c.photo_names[0]) : null;
  const category = c.discovered_for?.category ?? c.detail_primary_type ?? c.primary_type ?? "place";

  return (
    <AdminShell
      title="Discovered review"
      eyebrow={`Candidate ${index + 1} of ${candidates.length}`}
      aside={`${decided} / ${stats.total} reviewed · ${stats.approved} approved · ${stats.rejected} rejected`}
    >
      <div className="mt-4">
        <ProgressBar value={decided} max={stats.total} tone="brand" />
      </div>

      {/* Candidate detail — a bespoke media card, reskinned to the kit surface
          (hairline border + elevated ground). Status lives in kit chips in the
          body, so the photo carries no raw-hex overlay. */}
      <article
        className="mt-6 overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        {photo && (
          <div className="aspect-[16/10] w-full" style={{ background: "var(--app-bg-sunken)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <Tag tone="brand">{category}</Tag>
            {decision && (
              <StatusPill tone={decision === "approved" ? "positive" : "danger"}>
                {decision}
              </StatusPill>
            )}
          </div>

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
                <StatusPill tone="warning">
                  {c.business_status.replace("_", " ").toLowerCase()}
                </StatusPill>
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

      {/* Decision bar — three co-equal triage controls (an intentional
          exception to one-primary-action). Reject + Approve are kit AdminButtons
          in the server-action form; Skip stays a nav Link. */}
      <form action={onDecide} className="mt-4">
        <input type="hidden" name="id" value={c.google_place_id} />
        <div className="grid grid-cols-3 gap-2">
          <AdminButton
            variant="danger"
            icon={X}
            type="submit"
            name="action"
            value="rejected"
            formAction={async (fd) => {
              "use server";
              await onDecide(fd);
            }}
            className="w-full justify-center"
          >
            Reject
          </AdminButton>
          <Link
            href={`?i=${nextIdx >= 0 ? nextIdx : index}`}
            className="tap-44 inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            <SkipForward className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Skip
          </Link>
          <AdminButton
            variant="positive"
            icon={Check}
            type="submit"
            name="action"
            value="approved"
            className="w-full justify-center"
          >
            Approve
          </AdminButton>
        </div>
        {decision && (
          <AdminButton
            variant="ghost"
            icon={RotateCcw}
            type="submit"
            name="action"
            value="clear"
            className="mt-2"
          >
            Clear this decision
          </AdminButton>
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
          className="tap-44 inline-flex items-center"
          style={{ color: "var(--app-cool)" }}
        >
          ← Previous
        </Link>
        <span>{stats.undecided} undecided</span>
        <Link
          href={`?i=${nextIdx >= 0 ? nextIdx : index}`}
          className="tap-44 inline-flex items-center"
          style={{ color: "var(--app-cool)" }}
        >
          Next undecided →
        </Link>
      </nav>
    </AdminShell>
  );
}
