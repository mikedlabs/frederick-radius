import type { Metadata } from "next";
import { Landmark, MapPin, Calendar, ExternalLink, Award } from "lucide-react";
import {
  getFrederickHistoricPlaces,
  type HistoricPlace,
} from "@/lib/integrations/mdHistoricPlaces";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Historic places",
  description:
    "Every National Register of Historic Places site in Frederick County — districts, landmarks, and Civil War history. Live from the Maryland Historical Trust.",
};

// The National Register changes very rarely; revalidate weekly.
export const revalidate = 604800;

const BRICK = "var(--app-brand, #C4451C)";

function PlaceRow({ h }: { h: HistoricPlace }) {
  const meta = [h.category || null, h.listedYear ? `Listed ${h.listedYear}` : null].filter(
    Boolean,
  );
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: "var(--app-border)" }}>
      <a
        href={`/map?focus=${h.lat},${h.lng}`}
        className="flex items-start gap-3 px-4 pt-3 pb-2 transition-colors hover:bg-[var(--app-bg-sunken)]"
      >
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand, #C4451C) 16%, transparent)" }}
          aria-hidden
        >
          <Landmark className="h-4 w-4" strokeWidth={2} style={{ color: BRICK }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {h.name}
            </span>
            {h.isNHL && (
              <Chip tone="brand" className="shrink-0">
                <Award className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                National Landmark
              </Chip>
            )}
          </span>
          {h.altName && (
            <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {h.altName}
            </span>
          )}
          {meta.length > 0 && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              <span>{meta[0]}</span>
              {meta[1] && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {meta[1]}
                </span>
              )}
            </span>
          )}
        </span>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </a>
      {h.url && (
        <div className="-mt-1 pb-2.5 pl-[52px] pr-3">
          <Button
            variant="ghost"
            size="sm"
            href={h.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--app-cool)" }}
            iconRight={<ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />}
          >
            Maryland Historical Trust record
          </Button>
        </div>
      )}
    </li>
  );
}

export default async function HistoricPage() {
  const places = await getFrederickHistoricPlaces();

  const byMuni = new Map<string, HistoricPlace[]>();
  for (const h of places) {
    const a = byMuni.get(h.municipality);
    if (a) a.push(h);
    else byMuni.set(h.municipality, [h]);
  }
  const groups = [...byMuni.entries()]
    .map(([slug, list]) => ({
      slug,
      name: MUNICIPALITY_BY_SLUG[slug]?.name ?? slug,
      list: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          Maryland Historical Trust · live
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Historic places
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every National Register site in the county: historic districts,
          Civil War ground, and landmarks. Tap one to see it on the map,
          or open its official record.
        </p>
      </header>

      {places.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The historic places layer is briefly unavailable. It refreshes
          automatically, so check back shortly.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: BRICK }}>
              {places.length}
            </strong>{" "}
            registered places across {groups.length}{" "}
            {groups.length === 1 ? "area" : "areas"}
          </p>
          {groups.map((g) => (
            <section key={g.slug} className="space-y-2">
              <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {g.name}{" "}
                <span className="text-[12px] font-normal" style={{ color: "var(--app-ink-3)" }}>
                  {g.list.length}
                </span>
              </h2>
              <Surface as="ul" elevation={1} className="overflow-hidden">
                {g.list.map((h) => (
                  <PlaceRow key={h.id} h={h} />
                ))}
              </Surface>
            </section>
          ))}
          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Data: Maryland Open Data / Maryland Historical Trust, National
            Register of Historic Places. Refreshed weekly.
          </p>
        </>
      )}
    </div>
  );
}
