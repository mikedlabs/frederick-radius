import type { Metadata } from "next";
import { ExternalLink, Radar as RadarIcon, Store } from "lucide-react";
import { getRedditRadar } from "@/lib/integrations/redditRadar";
import { AdminShell, Section, StatStrip, EmptyState, Tag } from "@/components/admin/kit";

/**
 * /admin/radar — what r/frederickmd is talking about, owner-only.
 *
 * A morning-scan surface: possible catalog leads first (a place opening,
 * closing, changing hands), then the rest of the conversation. Titles + links
 * out to Reddit, nothing stored, nothing republished. DELIBERATELY not public:
 * the raw feed mixes real leads with unverified accusations about named local
 * businesses — the owner's judgment is the filter (see redditRadar.ts).
 */

export const metadata: Metadata = {
  title: "Community radar · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Row({
  title,
  url,
  agoLabel,
  lead,
  ask,
  about,
}: {
  title: string;
  url: string;
  agoLabel: string;
  lead: boolean;
  ask: boolean;
  about: string[];
}) {
  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-2.5 rounded-[var(--app-radius-sm)] px-2 py-2 hover:bg-[var(--app-bg-elevated)]"
      >
        <span className="min-w-0 flex-1 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
          {title}
          {lead && (
            <span className="ml-1.5 align-middle">
              <Tag tone="brand">Lead</Tag>
            </span>
          )}
          {ask && (
            <span className="ml-1.5 align-middle">
              <Tag tone="cool">Asking</Tag>
            </span>
          )}
          {about.map((name) => (
            <span key={name} className="ml-1.5 align-middle">
              <Tag tone="positive">In catalog: {name}</Tag>
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {agoLabel}
          <ExternalLink className="h-3 w-3 opacity-40 transition group-hover:opacity-80" strokeWidth={2.25} aria-hidden />
        </span>
      </a>
    </li>
  );
}

export default async function RadarPage() {
  const posts = await getRedditRadar().catch(() => []);
  const leads = posts.filter((p) => p.lead);
  const rest = posts.filter((p) => !p.lead);
  const asks = posts.filter((p) => p.ask).length;
  const aboutCatalog = posts.filter((p) => p.about.length > 0).length;

  return (
    <AdminShell
      eyebrow="Data program"
      title="Community radar"
      intro="What r/frederickmd is talking about right now. Titles link out to Reddit; nothing is stored or republished. Owner-only by design: raw community posts include unverified claims about named businesses, so this list informs the catalog, it never feeds the app directly."
      aside="r/frederickmd · RSS"
    >
      <div className="mt-5">
        <StatStrip
          items={[
            { value: posts.length, label: "Front-page posts" },
            { value: leads.length, label: "Catalog leads", tone: leads.length > 0 ? "brand" : "neutral" },
            { value: asks, label: "Asking for recs", tone: "cool" },
            { value: aboutCatalog, label: "About our places", tone: "positive" },
          ]}
        />
      </div>

      <Section
        title="Possible catalog leads"
        description="Titles that smell like a place opening, closing, or changing. Verify before touching the catalog. A Reddit title is a tip, not a fact."
      >
        {leads.length === 0 ? (
          <EmptyState icon={Store}>Nothing lead-shaped on the front page right now.</EmptyState>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {leads.map((p) => (
              <Row key={p.url} {...p} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="The rest of the conversation"
        description="Everything else on the front page, newest first."
      >
        {rest.length === 0 ? (
          <EmptyState icon={RadarIcon}>Feed unreachable or quiet. Try again in a few minutes.</EmptyState>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {rest.map((p) => (
              <Row key={p.url} {...p} />
            ))}
          </ul>
        )}
      </Section>
    </AdminShell>
  );
}
