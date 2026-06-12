import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import Masthead from "../../components/Masthead";

export const dynamic = "force-dynamic";

function statusText(p: NonNullable<ReturnType<typeof getPlaceBySlug>>): string {
  const s = p.open_status;
  if (s.state === "open") return `Open till ${s.closesAt}`;
  if (s.state === "closing-soon") return `Closing at ${s.closesAt}`;
  if (s.state === "closed") return "Closed now";
  return "Hours not listed";
}

export default async function LabAPlace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getPlaceBySlug(slug, FREDERICK_CENTER);
  if (!p) notFound();

  const reason = p.hidden_gem
    ? "A local secret worth the detour."
    : p.local_favorite
      ? "The one locals send you to."
      : p.short_blurb || "";

  const facts: Array<[string, string]> = [];
  if (typeof p.google_rating === "number") {
    facts.push(["RATING", `${p.google_rating.toFixed(1)} (${p.google_rating_count ?? 0})`]);
  }
  if (p.municipality_name) facts.push(["TOWN", p.municipality_name]);
  facts.push(["STATUS", statusText(p).toUpperCase()]);

  return (
    <main className="pb-16">
      <Masthead back={{ href: "/labs/a", label: "BACK" }} />

      {/* The headline anatomy, the same as the Plate so the place reads
          consistently from cover to detail. */}
      <div className="px-[var(--a-gutter)] pt-7">
        <p
          className="lab-a-mono uppercase tracking-[0.16em]"
          style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}
        >
          {p.category}
        </p>
        <h1 className="lab-a-display pt-2" style={{ fontSize: "var(--a-size-title)" }}>
          {p.name}
        </h1>
        {reason && (
          <p
            className="pt-3"
            style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink-2)", lineHeight: 1.5 }}
          >
            {reason}
          </p>
        )}
      </div>

      {p.google_photo_url && (
        <div className="px-[var(--a-gutter)] pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.google_photo_url}
            alt=""
            className="lab-a-image lab-a-fade aspect-[3/2] w-full rounded-[3px] object-cover"
          />
        </div>
      )}

      {/* The fact index. A specification table, ragged and quiet, set in the
          data face so it reads as a field-guide entry. */}
      <div className="px-[var(--a-gutter)] pt-8">
        <div className="lab-a-band" />
        {facts.map(([k, v]) => (
          <div key={k}>
            <div className="flex items-baseline justify-between py-3">
              <span
                className="lab-a-mono uppercase tracking-[0.16em]"
                style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}
              >
                {k}
              </span>
              <span
                className="lab-a-mono text-right uppercase tracking-[0.08em]"
                style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink)" }}
              >
                {v}
              </span>
            </div>
            <div className="lab-a-rule" />
          </div>
        ))}
        {p.address && (
          <p className="pt-3" style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-2)" }}>
            {p.address}
          </p>
        )}
      </div>

      {/* One primary action: directions. The single vermilion on the screen. */}
      <div className="px-[var(--a-gutter)] pt-8">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${p.geom.lat},${p.geom.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="lab-a-primary flex h-12 w-full items-center justify-center"
          style={{ fontSize: "var(--a-size-body)" }}
        >
          Get directions
        </a>
        {p.website && (
          <Link
            href={p.website}
            target="_blank"
            className="mt-3 flex h-12 w-full items-center justify-center rounded-full"
            style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink)", boxShadow: "inset 0 0 0 1px var(--a-rule)" }}
          >
            Visit the website
          </Link>
        )}
      </div>
    </main>
  );
}
