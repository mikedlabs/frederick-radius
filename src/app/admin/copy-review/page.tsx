import type { Metadata } from "next";
import Link from "next/link";
import DESCRIPTIONS_RAW from "@/data/descriptions.json" with { type: "json" };
import { publicPlaces } from "@/lib/loaders/places";
import { classifyDescription } from "@/lib/copy-quality";
import type { PlaceDescriptionEntry } from "@/lib/loaders/placeDescriptions";
import {
  AdminShell,
  StatStrip,
  SectionLabel,
  HairlineList,
  Callout,
  AllClear,
} from "@/components/admin/kit";

export const metadata: Metadata = {
  title: "Copy review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const DESCRIPTIONS = DESCRIPTIONS_RAW as Record<string, PlaceDescriptionEntry>;

function host(value?: string): string {
  if (!value) return "Radius editorial";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

export default function CopyReview() {
  const places = publicPlaces();
  const bySlug = new Map(places.map((place) => [place.slug, place]));
  const approved = Object.entries(DESCRIPTIONS).filter(([, entry]) => entry.status === "approved");
  const candidates = Object.entries(DESCRIPTIONS).filter(([, entry]) => entry.status === "candidate");
  const weak = places
    .filter((place) => classifyDescription(place.name, place.description ?? place.short_blurb) !== "auto_clean")
    .filter((place) => DESCRIPTIONS[place.slug]?.status !== "approved")
    .slice(0, 200);

  return (
    <AdminShell
      eyebrow="Source-backed editorial"
      title="Copy review"
      intro="Review first-party description candidates before they become Radius copy. Public pages only load entries marked approved."
    >
      <div className="mt-6">
        <StatStrip
          items={[
            { value: candidates.length, label: "waiting for review", tone: candidates.length > 0 ? "warning" : "positive" },
            { value: approved.length, label: "source-backed approvals", tone: "positive" },
            { value: weak.length, label: "weak listings shown", tone: weak.length > 0 ? "warning" : "positive" },
          ]}
        />
      </div>

      <div className="mt-4">
        <Callout tone="cool" title="Publishing rule">
          Candidates come from a business&apos;s own site or an official source. Check the sentence against the linked page, then change its status in <code>src/data/descriptions.json</code> to <code>approved</code> and add <code>reviewed_at</code> plus a short <code>reviewer_note</code>. Google summaries and reviews stay live and attributed; they never enter this file.
        </Callout>
      </div>

      <section className="mt-7">
        <SectionLabel
          aside={<span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{candidates.length}</span>}
        >
          Waiting for review
        </SectionLabel>
        {candidates.length === 0 ? (
          <AllClear>No description candidates are waiting.</AllClear>
        ) : (
          <HairlineList>
            {candidates.map(([slug, entry], index) => (
              <li
                key={slug}
                className="bg-[var(--app-bg-elevated)] px-3 py-3"
                style={index > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/places/${slug}`} className="text-[14px] font-semibold hover:underline" style={{ color: "var(--app-ink)" }}>
                    {bySlug.get(slug)?.name ?? slug}
                  </Link>
                  {entry.source.url ? (
                    <a href={entry.source.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs underline underline-offset-2" style={{ color: "var(--app-ink-3)" }}>
                      {host(entry.source.url)}
                    </a>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {entry.blurb}
                </p>
              </li>
            ))}
          </HairlineList>
        )}
      </section>

      <section className="mt-8">
        <SectionLabel
          aside={<span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{weak.length} shown</span>}
        >
          Needs first-party evidence
        </SectionLabel>
        {weak.length === 0 ? (
          <AllClear>Every public listing has useful reviewed copy.</AllClear>
        ) : (
          <HairlineList>
            {weak.map((place, index) => (
              <li
                key={place.slug}
                className="bg-[var(--app-bg-elevated)] px-3 py-2.5"
                style={index > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/places/${place.slug}`} className="min-w-0 text-[14px] font-semibold hover:underline" style={{ color: "var(--app-ink)" }}>
                    {place.name}
                  </Link>
                  <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {place.category} · {place.source}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                  {(place.description ?? place.short_blurb ?? "").slice(0, 240) || "No public Radius description"}
                </p>
              </li>
            ))}
          </HairlineList>
        )}
      </section>
    </AdminShell>
  );
}
