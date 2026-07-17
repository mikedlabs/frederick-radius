"use client";

/**
 * WantAnswerPanel — the in-place answer when a craving chip is tapped.
 *
 * The page never navigates: the panel expands inside the "I want…" strip
 * with ONE hero answer (the best open-now pick), a short "also open now"
 * list, and a folded "opens later" group. Tapping a place opens the
 * global PlaceSheet — the same no-navigation detail layer the map uses —
 * so the grammar is page → panel → sheet throughout the app.
 *
 * Layout rules it lives by: typography carries hierarchy (hairline
 * separators, no per-row boxes), exactly one count on the whole panel
 * (the browse tie-out), honest empty states, 44px targets, and focus moves
 * in on open and back to the chip on close. The panel paints immediately:
 * response UI should never wait on the site's decorative entrance motion.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, NotebookPen, X } from "lucide-react";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import type { PlaceCardData } from "@/lib/loaders/places";
import { getWantAnswer } from "@/lib/want-cache";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";

type WantRow = {
  slug: string;
  name: string;
  fact: string;
  distance: string | null;
  photo: string | null;
  where: string | null;
  detail: string | null;
  tip: string | null;
  deal: string | null;
};

type WantAnswer = {
  key: string;
  label: string;
  hero: WantRow | null;
  also: WantRow[];
  later: WantRow[];
  laterMore: number;
  notable: WantRow[];
  total: number;
  browseHref: string;
  contextLabel: string;
  contextSource: "town" | "device" | "home" | "ip" | "county" | "none";
  fallbackReason: "outside-county" | "location-unavailable" | null;
};

/** Scope label in mid-sentence form: "strongest matches {…}". The raw chip
 *  labels read wrong composed ("matches for whole county" / "for near me"). */
function matchScopePhrase(label: string): string {
  if (/^whole county$/i.test(label)) return "across the county";
  if (/^near me$/i.test(label)) return "near you";
  return `for ${label}`;
}

export default function WantAnswerPanel({
  cKey,
  facet,
  label,
  accent,
  onClose,
}: {
  cKey: string;
  facet: string | null;
  /** Display label for the tapped chip — shown instantly, before data lands. */
  label: string;
  accent: string;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState<WantAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { openSheet } = usePlaceSheet();
  const router = useRouter();

  // Fetch the answer through the shared want cache, which reuses the request
  // the chip already kicked off on pointerdown (and any cached fix rides
  // along, so a tap never triggers a permission prompt). A `live` flag
  // stands in for AbortController since the cached promise is shared.
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset panel state for the newly tapped craving before its fetch resolves
    setAnswer(null);
    setFailed(false);
    setShowLater(false);
    getWantAnswer(cKey, facet)
      .then((a) => {
        if (!live) return;
        const ans = a as WantAnswer;
        setAnswer(ans);
        track("want_answer", { c: cKey, open: ans.hero ? 1 : 0 });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [cKey, facet]);

  // Focus lands on the panel heading when it opens (WCAG 2.4.3); Escape
  // closes. The chip that opened it receives focus back via onClose's
  // caller.
  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Row tap → hydrate the slim PlaceCardData and open the global sheet
  // (the map's exact pattern). If hydration fails, fall through to the
  // place page — never a dead tap.
  async function openPlace(slug: string) {
    haptic("light");
    try {
      const r = await fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slug)}`);
      const j = (await r.json()) as { places?: PlaceCardData[] };
      const p = j.places?.[0];
      if (p) {
        track("want_place_open", { c: cKey });
        openSheet(p);
        return;
      }
    } catch {
      /* fall through to navigation */
    }
    router.push(`/places/${slug}`);
  }

  return (
    <section
      className="overflow-hidden rounded-[var(--app-radius-lg)]"
      aria-label={`${label}, right now`}
      style={{
        border: `1px solid color-mix(in srgb, ${accent} 40%, var(--app-border))`,
        background: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
        boxShadow: "var(--app-elev-2), var(--app-hi)",
      }}
    >
      {/* Header — the tapped craving, restated; ✕ hands focus back. */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-[17px] font-semibold tracking-tight outline-none"
          style={{ color: "var(--app-ink)" }}
        >
          {label}
          <span className="ml-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: `color-mix(in srgb, ${accent} 75%, var(--app-ink))` }}>
            right now
          </span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label}`}
          className="tap-44 -mr-1 grid h-7 w-7 place-items-center rounded-full"
          style={{ color: "var(--app-ink-3)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {answer && (
        <p className="px-4 pt-0.5 font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
          {answer.contextLabel}
          {answer.fallbackReason === "outside-county"
            ? " · network location was outside Frederick County"
            : answer.fallbackReason === "location-unavailable"
              ? " · location unavailable"
              : ""}
        </p>
      )}

      {failed ? (
        <p className="px-4 pb-4 pt-2 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          Couldn&rsquo;t load this one. <Link href={`/nearby?c=${cKey}`} className="underline underline-offset-2" style={{ color: "var(--app-cool)" }}>Open the full list</Link> instead.
        </p>
      ) : !answer ? (
        <SkeletonRows />
      ) : (
        <>
          {answer.hero ? (
            <button
              type="button"
              onClick={() => openPlace(answer.hero!.slug)}
              className="tactile-interactive flex w-full items-center gap-3.5 px-4 py-3 text-left"
            >
              {answer.hero.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- 56px thumb, proxied/cached upstream; next/image adds nothing at this size
                <img
                  src={answer.hero.photo}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-[12px] object-cover"
                  style={{ boxShadow: "var(--app-edge), var(--app-hi)" }}
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-[12px] font-serif text-[22px] font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${accent} 16%, var(--app-bg-elevated))`,
                    color: `color-mix(in srgb, ${accent} 80%, var(--app-ink))`,
                  }}
                >
                  {answer.hero.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate font-serif text-[18px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {answer.hero.name}
                  </span>
                  {answer.hero.deal && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
                      style={{ background: "var(--app-brand-tint-14)", color: "var(--app-brand-press)" }}
                    >
                      {answer.hero.deal}
                    </span>
                  )}
                </span>
                {(answer.hero.detail || answer.hero.where) && (
                  <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
                    {answer.hero.detail}
                    {answer.hero.detail && answer.hero.where ? " · " : ""}
                    {answer.hero.where && (
                      <span style={{ color: "var(--app-ink-3)" }}>{answer.hero.where}</span>
                    )}
                  </span>
                )}
                <span className="mt-1 block truncate font-mono text-[11.5px]" style={{ color: "var(--app-positive)" }}>
                  {answer.hero.fact}
                  {answer.hero.distance ? (
                    <span style={{ color: "var(--app-ink-3)" }}> · {answer.hero.distance}</span>
                  ) : null}
                </span>
                {answer.hero.tip && (
                  <span className="mt-1.5 flex gap-1.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                    <NotebookPen className="mt-[2px] h-3 w-3 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} aria-hidden />
                    <span className="line-clamp-2">{answer.hero.tip}</span>
                  </span>
                )}
              </span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0 self-start mt-1" style={{ color: "var(--app-ink-3)" }} />
            </button>
          ) : answer.notable.length > 0 ? (
            <div className="px-4 pb-1">
              <p className="pb-1 pt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Nothing&rsquo;s confirmed open right now. Here are the strongest matches {matchScopePhrase(answer.contextLabel)}.
              </p>
              <ul className="border-t pt-1" style={{ borderColor: "var(--app-border)" }}>
                {answer.notable.map((r) => (
                  <li key={r.slug}>
                    <button
                      type="button"
                      onClick={() => openPlace(r.slug)}
                      className="tap-44-y flex w-full items-start justify-between gap-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                          {r.name}
                        </span>
                        {metaLine(r) && (
                          <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                            {metaLine(r)}
                          </span>
                        )}
                      </span>
                      {r.distance && (
                        <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                          {r.distance}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="px-4 pb-1 pt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Nothing&rsquo;s open for this right now.
              {answer.later[0] ? ` Earliest: ${answer.later[0].name}, ${answer.later[0].fact.replace(/^Opens /, "").toLowerCase()}.` : ""}
            </p>
          )}

          {answer.also.length > 0 && (
            <div className="px-4 pb-1">
              <p className="border-t pb-1 pt-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)", borderColor: "var(--app-border)" }}>
                Also open now
              </p>
              <ul>
                {answer.also.map((r) => (
                  <li key={r.slug}>
                    <button
                      type="button"
                      onClick={() => openPlace(r.slug)}
                      className="tap-44-y flex w-full items-start justify-between gap-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                            {r.name}
                          </span>
                          {r.deal && (
                            <span
                              className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
                              style={{ background: "var(--app-brand-tint-14)", color: "var(--app-brand-press)" }}
                            >
                              {r.deal}
                            </span>
                          )}
                        </span>
                        {metaLine(r) && (
                          <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                            {metaLine(r)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                        {r.fact.replace(/^Open until /, "until ")}
                        {r.distance ? ` · ${r.distance}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answer.later.length > 0 && (
            <div className="px-4">
              {showLater ? (
                <ul className="border-t pt-1" style={{ borderColor: "var(--app-border)" }}>
                  {answer.later.map((r) => (
                    <li key={r.slug}>
                      <button
                        type="button"
                        onClick={() => openPlace(r.slug)}
                        className="tap-44-y flex w-full items-baseline justify-between gap-3 py-2 text-left"
                      >
                        <span className="min-w-0 truncate text-[14px]" style={{ color: "var(--app-ink-2)" }}>
                          {r.name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                          {r.fact.toLowerCase()}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLater(true)}
                  className="tap-44-y flex w-full items-center justify-between border-t py-2.5 text-left text-[12.5px]"
                  style={{ color: "var(--app-ink-2)", borderColor: "var(--app-border)" }}
                >
                  Opens later
                  {answer.laterMore > 0 || answer.later.length > 0 ? (
                    <span className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {answer.later[0]?.fact.toLowerCase()}
                      
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          )}

          {/* The tie-out — the panel's ONE count, and the door to deep browse. */}
          <Link
            href={answer.browseHref}
            className="flex items-center justify-between border-t px-4 py-3 text-[13px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: `color-mix(in srgb, ${accent} 70%, var(--app-ink))` }}
          >
            {answer.total > 0 ? `All ${answer.total} results · ${answer.contextLabel}` : "Browse the full list"}
            <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        </>
      )}
    </section>
  );
}

/** The one field-guide subline for a compact row: the signature and the
 *  town, joined ("Wood-fired pies · Brunswick"). Null when we have neither. */
function metaLine(r: WantRow): string | null {
  const parts = [r.detail, r.where].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

function SkeletonRows() {
  return (
    <div className="space-y-3 px-4 pb-4 pt-3" aria-hidden>
      <div className="flex items-center gap-3.5">
        <div className="h-14 w-14 rounded-[12px]" style={{ background: "var(--app-bg-sunken)" }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded" style={{ background: "var(--app-bg-sunken)" }} />
          <div className="h-3 w-1/3 rounded" style={{ background: "var(--app-bg-sunken)" }} />
        </div>
      </div>
      <div className="h-3 w-1/2 rounded" style={{ background: "var(--app-bg-sunken)" }} />
      <div className="h-3 w-2/5 rounded" style={{ background: "var(--app-bg-sunken)" }} />
    </div>
  );
}
