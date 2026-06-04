import Image from "next/image";
import {
  Compass,
  MapPin,
  Star,
  Stamp,
  Bookmark,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Navigation,
} from "lucide-react";
import { PLACES, AERIALS, HERO_AERIAL } from "./data";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * Saved / Field guide — reimagined as a premium passport.
 *
 * A full-bleed aerial cover wearing a passport masthead + a collection
 * crest, a "recently stamped" snap rail of overlapping place stamps, then
 * the saved places grouped into town "chapters" down a left-hand spine —
 * each chapter a curated stack with its own progress pill. Purely
 * presentational (server component): all "state" is baked-in mock data.
 */

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const;
const DEPTH =
  "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";

// Curated town chapters, ordered as a journey out from downtown. Each town
// pairs its saved places with a lead aerial for a magazine-spread feel.
const CHAPTERS: { town: string; aerial: string }[] = [
  { town: "Downtown", aerial: AERIALS[0] },
  { town: "Frederick", aerial: AERIALS[5] },
  { town: "Brunswick", aerial: AERIALS[2] },
  { town: "Middletown", aerial: AERIALS[3] },
];

export default function SavedMock() {
  const totalTowns = 7; // towns across the county worth exploring
  const visitedTowns = 6; // towns the owner has at least one save in
  const saved = PLACES.length;
  const pct = Math.round((visitedTowns / totalTowns) * 100);

  // Most-recent saves for the stamp rail (curated, photo matches label).
  const recent = PLACES.slice(0, 6);

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
      style={{ background: "var(--app-bg)" }}
    >
      {/* ───────────────────────── COVER ───────────────────────── */}
      <header className="relative h-[460px] w-full overflow-hidden">
        <Image
          src={HERO_AERIAL}
          alt="Aerial view over Frederick County at golden hour"
          fill
          priority
          sizes="440px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
        {/* legibility wash */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(26,24,21,0.46) 0%, rgba(26,24,21,0.05) 30%, rgba(26,24,21,0.20) 62%, rgba(26,24,21,0.86) 100%)",
          }}
        />

        {/* top chrome */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/95 backdrop-blur-md"
            style={{ background: "rgba(255,255,255,0.14)" }}
          >
            <Compass className="h-3.5 w-3.5" strokeWidth={2.2} />
            Field Guide
          </span>
          <span
            className="grid h-9 w-9 place-items-center rounded-full text-white/95 backdrop-blur-md"
            style={{ background: "rgba(255,255,255,0.14)" }}
            aria-hidden
          >
            <Search className="h-4 w-4" strokeWidth={2.2} />
          </span>
        </div>

        {/* masthead + crest */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-6">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70">
                Frederick County · MD
              </p>
              <h1
                className="mt-1.5 text-[40px] leading-[0.95] tracking-[-0.01em] text-white"
                style={SERIF}
              >
                My Field
                <br />
                Guide
              </h1>
              <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-white/85">
                <Bookmark className="h-3.5 w-3.5" strokeWidth={2.4} />
                {saved} saved · {visitedTowns} towns explored
              </p>
            </div>

            {/* progress crest */}
            <CollectionCrest pct={pct} visited={visitedTowns} total={totalTowns} />
          </div>
        </div>
      </header>

      {/* sticky segmented control, overlapping the cover */}
      <div className="sticky top-0 z-20 -mt-5 px-4">
        <div
          className="flex items-center gap-1 rounded-full border p-1"
          style={{
            background: "var(--app-bg-elevated-solid)",
            borderColor: "var(--app-border)",
            boxShadow: DEPTH,
          }}
        >
          <Segment label="All" count={saved} active />
          <Segment label="By town" count={visitedTowns} />
          <Segment label="Stamps" count={saved} />
        </div>
      </div>

      {/* ──────────────────── RECENTLY STAMPED RAIL ─────────────── */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[19px] tracking-[-0.01em]" style={SERIF}>
            Recently stamped
          </h2>
          <span className="flex items-center gap-0.5 text-[12px] font-semibold text-[var(--app-ink-3)]">
            Passport <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
        </div>

        <div
          className="mt-3 flex gap-3.5 overflow-x-auto px-5 pb-2"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {recent.map((p, i) => (
            <article
              key={p.slug}
              className="relative shrink-0"
              style={{ scrollSnapAlign: "start" }}
            >
              <span className="relative block h-[178px] w-[136px] overflow-hidden rounded-[20px]">
                <Image
                  src={p.photo}
                  alt={p.name}
                  fill
                  sizes="140px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(26,24,21,0) 38%, rgba(26,24,21,0.82) 100%)",
                  }}
                />
                {/* stamp seal */}
                <span
                  className="absolute right-2 top-2 grid h-7 w-7 -rotate-[14deg] place-items-center rounded-full text-white"
                  style={{
                    background: p.color,
                    boxShadow: "0 4px 12px -3px rgba(26,24,21,0.5)",
                  }}
                  aria-hidden
                >
                  <Stamp className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
                <span className="absolute inset-x-0 bottom-0 p-2.5">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                    {p.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/75">
                    <MapPin className="h-2.5 w-2.5" strokeWidth={2.6} />
                    {p.neighborhood}
                  </span>
                </span>
              </span>
              {/* day marker */}
              <span className="mt-2 block text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--app-ink-3)]">
                {i === 0 ? "Today" : i === 1 ? "Today" : `Day ${i}`}
              </span>
            </article>
          ))}
        </div>
      </section>

      {/* ─────────────────────── TOWN CHAPTERS ──────────────────── */}
      <section className="mt-5 px-5 pb-8">
        <div className="flex items-center gap-2">
          <h2 className="text-[19px] tracking-[-0.01em]" style={SERIF}>
            Your towns
          </h2>
          <span className="flex items-center gap-1 rounded-full bg-[var(--app-brand-tint-14)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--app-brand)]">
            <Sparkles className="h-3 w-3" strokeWidth={2.4} /> Curated
          </span>
        </div>

        {/* spine timeline */}
        <div className="relative mt-4 pl-7">
          <span
            aria-hidden
            className="absolute left-[10px] top-2 bottom-6 w-px"
            style={{ background: "var(--app-border)" }}
          />
          <div className="space-y-7">
            {CHAPTERS.map((c, ci) => {
              const places = PLACES.filter((p) => p.neighborhood === c.town);
              if (places.length === 0) return null;
              const lead = places[0];
              const rest = places.slice(1);
              return (
                <article key={c.town} className="relative">
                  {/* spine node */}
                  <span
                    aria-hidden
                    className="absolute -left-7 top-1 grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-[10px] font-bold"
                    style={{
                      background: "var(--app-bg-elevated-solid)",
                      borderColor: lead.color,
                      color: lead.color,
                    }}
                  >
                    {ci + 1}
                  </span>

                  {/* chapter card */}
                  <div
                    className="overflow-hidden rounded-[22px] border"
                    style={{
                      background: "var(--app-bg-elevated-solid)",
                      borderColor: "var(--app-border)",
                      boxShadow: DEPTH,
                    }}
                  >
                    {/* lead spread: aerial + town title */}
                    <div className="relative h-[132px] w-full">
                      <Image
                        src={c.aerial}
                        alt={`Aerial over ${c.town}`}
                        fill
                        sizes="440px"
                        placeholder="blur"
                        blurDataURL={PAPER_CREAM_BLUR}
                        className="object-cover"
                      />
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(26,24,21,0.10) 0%, rgba(26,24,21,0.20) 45%, rgba(26,24,21,0.80) 100%)",
                        }}
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3.5">
                        <div>
                          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                            Chapter {ci + 1}
                          </p>
                          <h3
                            className="text-[26px] leading-none text-white"
                            style={SERIF}
                          >
                            {c.town}
                          </h3>
                        </div>
                        {/* progress pill */}
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md"
                          style={{ background: "rgba(255,255,255,0.16)" }}
                        >
                          <Bookmark className="h-3 w-3" strokeWidth={2.6} />
                          {places.length} saved
                        </span>
                      </div>
                    </div>

                    {/* lead place row */}
                    <PlaceRow p={lead} lead />

                    {/* stacked remaining places */}
                    {rest.map((p) => (
                      <PlaceRow key={p.slug} p={p} />
                    ))}

                    {/* add-to-chapter footer */}
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 border-t py-3 text-[12.5px] font-semibold text-[var(--app-ink-3)]"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                      Add a place in {c.town}
                    </button>
                  </div>
                </article>
              );
            })}

            {/* next-chapter teaser node */}
            <article className="relative">
              <span
                aria-hidden
                className="absolute -left-7 top-1 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-dashed text-[var(--app-ink-3)]"
                style={{ background: "var(--app-bg)", borderColor: "var(--app-border)" }}
              >
                <Navigation className="h-3 w-3" strokeWidth={2.4} />
              </span>
              <div
                className="rounded-[22px] border border-dashed p-4"
                style={{ borderColor: "var(--app-border)" }}
              >
                <p className="text-[14px] font-semibold text-[var(--app-ink)]">
                  3 more towns to discover
                </p>
                <p className="mt-0.5 text-[12.5px] text-[var(--app-ink-3)]">
                  Mount Airy, Woodsboro & Emmitsburg are waiting for their first
                  stamp.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function CollectionCrest({
  pct,
  visited,
  total,
}: {
  pct: number;
  visited: number;
  total: number;
}) {
  // SVG progress ring around a stamp count — the "passport seal".
  const r = 30;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div
      className="relative grid h-[88px] w-[88px] shrink-0 place-items-center rounded-full backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.12)" }}
    >
      <svg
        className="absolute inset-0 -rotate-90"
        viewBox="0 0 88 88"
        aria-hidden
      >
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="5"
        />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="var(--app-accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="text-center leading-none text-white">
        <p className="text-[22px] font-bold" style={SERIF}>
          {visited}
          <span className="text-[13px] font-semibold text-white/70">
            /{total}
          </span>
        </p>
        <p className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Towns
        </p>
      </div>
    </div>
  );
}

function Segment({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <span
      className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors"
      style={
        active
          ? { background: "var(--app-ink)", color: "var(--app-ink-inverse)" }
          : { color: "var(--app-ink-3)" }
      }
    >
      {label}
      <span
        className="rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums"
        style={
          active
            ? { background: "rgba(255,255,255,0.18)", color: "#fff" }
            : { background: "var(--app-ink-tint-6)", color: "var(--app-ink-3)" }
        }
      >
        {count}
      </span>
    </span>
  );
}

function PlaceRow({ p, lead = false }: { p: (typeof PLACES)[number]; lead?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 border-t px-3.5 py-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span
        className={`relative block shrink-0 overflow-hidden rounded-[14px] ${
          lead ? "h-16 w-16" : "h-14 w-14"
        }`}
      >
        <Image
          src={p.photo}
          alt={p.name}
          fill
          sizes="72px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: p.color }}
            aria-hidden
          />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--app-ink-3)]">
            {p.category}
          </span>
          {p.open && (
            <span className="text-[10.5px] font-semibold text-[var(--app-positive)]">
              · Open
            </span>
          )}
        </div>
        <p
          className={`mt-0.5 truncate font-semibold text-[var(--app-ink)] ${
            lead ? "text-[16px]" : "text-[14.5px]"
          }`}
        >
          {p.name}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--app-ink-3)]">
          <span className="flex items-center gap-0.5 font-semibold text-[var(--app-ink-2)]">
            <Star
              className="h-3 w-3"
              strokeWidth={2.2}
              style={{ fill: "var(--app-accent)", color: "var(--app-accent)" }}
            />
            {p.rating.toFixed(1)}
          </span>
          <span aria-hidden>·</span>
          <span>{p.price}</span>
          <span aria-hidden>·</span>
          <span>{p.distance}</span>
        </p>
      </div>

      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ background: "var(--app-brand-tint-14)", color: "var(--app-brand)" }}
        aria-hidden
      >
        <Bookmark className="h-4 w-4" strokeWidth={2.4} style={{ fill: "var(--app-brand)" }} />
      </span>
    </div>
  );
}
