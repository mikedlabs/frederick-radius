import type { Metadata } from "next";
import { MapPin, User, Calendar } from "lucide-react";
import { getFrederickArt, type ArtPiece } from "@/lib/integrations/fcArtTour";
import PlacePhoto from "@/components/place/PlacePhoto";
import CategoryIcon from "@/components/place/CategoryIcon";

export const metadata: Metadata = {
  title: "Public art tour",
  description:
    "A self-guided tour of Frederick's public murals and sculptures. Live from Frederick County GIS.",
};

// Public art changes rarely; the integration revalidates weekly.
export const revalidate = 604800;

// PlacePhoto's fallback math expects a hex color (it appends an alpha
// byte). Harvest gold = the app's --app-accent token value.
const ART_HEX = "#D9A441";
const ART_GLYPH = "\u{1F3A8}"; // artist palette

function ArtCard({ a }: { a: ArtPiece }) {
  const credit = [a.artist, a.year].filter(Boolean).join(" · ");
  return (
    <li>
      <a
        href={`/map?focus=${a.lat},${a.lng}`}
        className="hover-lift block overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.99]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="relative h-44 w-full bg-[var(--app-bg-sunken)]">
          {a.thumbUrl ? (
            <PlacePhoto
              src={a.thumbUrl}
              alt={a.name}
              glyph={ART_GLYPH}
              color={ART_HEX}
              slug="public-art"
              sizes="(min-width: 640px) 50vw, 100vw"
              rounded="0"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-full w-full items-center justify-center"
              style={{
                background: `radial-gradient(120% 120% at 30% 20%, ${ART_HEX}2e, ${ART_HEX}0a 70%)`,
                color: ART_HEX,
              }}
            >
              <CategoryIcon slug="public-art" strokeWidth={1.5} className="h-12 w-12 opacity-90" style={{ color: ART_HEX }} />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        </div>
        <div className="space-y-1 px-3.5 py-3">
          <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {a.name}
          </p>
          {credit && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {a.artist && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {a.artist}
                </span>
              )}
              {a.year && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {a.year}
                </span>
              )}
            </p>
          )}
          {a.blurb && (
            <p className="line-clamp-2 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {a.blurb}
            </p>
          )}
          {a.location && (
            <p className="inline-flex items-start gap-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
              {a.location}
            </p>
          )}
        </div>
      </a>
    </li>
  );
}

export default async function ArtPage() {
  const pieces = await getFrederickArt();

  const byCat = new Map<string, ArtPiece[]>();
  for (const a of pieces) {
    const label = a.category ?? "Other";
    const arr = byCat.get(label);
    if (arr) arr.push(a);
    else byCat.set(label, [a]);
  }
  const groups = [...byCat.entries()]
    .map(([label, list]) => ({
      label,
      list: list.sort((x, y) => x.name.localeCompare(y.name)),
    }))
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          Frederick County GIS · public art
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Public art tour
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          A self-guided walk through Frederick&apos;s murals and
          sculptures. Tap any piece to see exactly where it is on the map.
        </p>
      </header>

      {pieces.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The public art layer is briefly unavailable. It refreshes
          automatically, so check back shortly.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: ART_HEX }}>
              {pieces.length}
            </strong>{" "}
            works across {groups.length}{" "}
            {groups.length === 1 ? "collection" : "collections"}
          </p>
          {groups.map((g) => (
            <section key={g.label} className="space-y-2.5">
              <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {g.label}{" "}
                <span className="text-[12px] font-normal" style={{ color: "var(--app-ink-3)" }}>
                  {g.list.length}
                </span>
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.list.map((a) => (
                  <ArtCard key={a.id} a={a} />
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Data and images: Frederick County GIS public art tour,
            refreshed weekly.
          </p>
        </>
      )}
    </div>
  );
}
