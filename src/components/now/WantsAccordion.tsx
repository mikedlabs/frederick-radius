"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck,
  Utensils,
  UtensilsCrossed,
  Coffee,
  IceCream,
  Cookie,
  ShoppingCart,
  Croissant,
  Beer,
  Wine,
  Martini,
  Trees,
  Mountain,
  Waves,
  Flag,
  Tractor,
  FerrisWheel,
  Music,
  Palette,
  Landmark,
  Route,
  ShoppingBag,
  ShoppingBasket,
  BookOpen,
  Sparkles,
  BedDouble,
  ParkingCircle,
  Train,
  Bus,
  Wrench,
  Activity,
  Pizza,
  FlaskConical,
  Armchair,
  Building2,
  Heart,
  Library,
  Hotel,
  Film,
  Scissors,
  PawPrint,
  Church,
  Pill,
  type LucideIcon,
} from "lucide-react";
import { WANTS, type WantSub } from "@/data/wants";
import { GLYPHS } from "@/components/glyphs";
import { prefetchWant } from "@/lib/want-cache";
import { haptic } from "@/lib/haptics";
import { useSavedTasteWant } from "@/hooks/useSavedTasteWant";
import WantAnswerPanel from "./WantAnswerPanel";

/**
 * A /nearby?c= craving OR a /category/<slug> chip answers INLINE (the
 * WantAnswerPanel below the chips) instead of navigating; the bespoke
 * curated pages (/brunch, /parks, /rivers, /happy-hour…) keep their normal
 * navigation. Returns the parsed want when the href is interceptable, null
 * otherwise. Kept as a plain function so middle-click / new-tab / no-JS
 * still navigate to the real page — interception is an enhancement, never
 * the only path. Category slugs ride as a "cat:" key so the answer engine
 * can't confuse them with a craving.
 */
function inlineWantFor(href: string): { c: string; facet: string | null } | null {
  if (href.startsWith("/nearby?")) {
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    const c = params.get("c");
    if (!c) return null;
    return { c, facet: params.get("facet") };
  }
  const cat = href.match(/^\/category\/([a-z0-9-]+)\/?$/i);
  if (cat) return { c: `cat:${cat[1]}`, facet: null };
  return null;
}

/** The chip label for a want key, for URL-restored panels ("coffee" → "Coffee"). */
function labelForWant(c: string): string {
  for (const cat of WANTS) {
    for (const sub of cat.subs) {
      const w = inlineWantFor(sub.href);
      if (w?.c === c) return sub.label;
    }
  }
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Reflect the open answer in the URL (?want=&facet=) without a history
 *  entry or an RSC round-trip — refresh restores it, share carries it. */
function reflectWantInUrl(want: { c: string; facet: string | null } | null) {
  const url = new URL(window.location.href);
  if (want) {
    url.searchParams.set("want", want.c);
    if (want.facet) url.searchParams.set("facet", want.facet);
    else url.searchParams.delete("facet");
  } else {
    url.searchParams.delete("want");
    url.searchParams.delete("facet");
  }
  window.history.replaceState(window.history.state, "", url);
}

const ICONS: Record<string, LucideIcon> = {
  Utensils, UtensilsCrossed, Coffee, IceCream, Cookie, ShoppingCart, Croissant,
  Beer, Wine, Martini, Trees, Mountain, Waves, Flag, Tractor, FerrisWheel, Music,
  Palette, Landmark, Route, ShoppingBag, ShoppingBasket, BookOpen, Sparkles,
  BedDouble, ParkingCircle, Train, Bus, Wrench, Activity, Pizza, FlaskConical,
  Armchair, Building2, Heart, Library, Hotel, Film, Scissors, PawPrint,
  Church, Pill, CalendarCheck,
};

/**
 * Bespoke engraved WOODCUT first (the app's signature mark), Lucide line-icon
 * fallback — the exact GLYPHS-first precedence CategoryIcon/craveTile use.
 */
function renderIcon(name: string, sizeClass: string) {
  const Glyph = GLYPHS[name];
  if (Glyph) return <Glyph className={sizeClass} aria-hidden />;
  const Icon = ICONS[name] ?? Utensils;
  return <Icon className={sizeClass} strokeWidth={1.9} aria-hidden />;
}

/**
 * WantsAccordion — the compact quick-action lane beneath Ask Radius.
 *
 * Main intents live in one horizontal row; the selected intent's specific
 * answers live directly beneath it. This keeps Ask + quick actions in one
 * screen instead of repeating the active category as a large card, a chip row,
 * and a second grid of categories.
 *
 * All routing behavior is unchanged: the meal-aware Eat lead, the saved-taste
 * default, and the home-town scoping of /nearby answers all still apply.
 */
export default function WantsAccordion({
  meal,
  defaultOpen = "eat",
}: {
  meal: { key: string; label: string; phrase: string };
  defaultOpen?: string;
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string>(defaultOpen);
  // The inline answer: which /nearby-style want is expanded below the chips.
  // Label rides along so the panel header paints before the fetch lands.
  const [answer, setAnswer] = useState<{ c: string; facet: string | null; label: string } | null>(
    null,
  );
  // Restore a shared/refreshed ?want= from the URL, once, post-mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("want");
    if (!c) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount URL restore; SSR can't read the query for this client island
    setAnswer({ c, facet: params.get("facet"), label: labelForWant(c) });
  }, []);
  // Saved-taste default: once the user's saves show a dominant craving, promote
  // THAT main to the hero instead of the time-of-day guess. Additive; resolves
  // post-mount, never overrides a tile the user has already tapped (touchedRef).
  const savedWant = useSavedTasteWant();
  const touchedRef = useRef(false);
  useEffect(() => {
    if (touchedRef.current || !savedWant) return;
    if (WANTS.some((w) => w.key === savedWant)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- apply the client-only saved-taste default after the by-slugs join resolves; SSR can't see localStorage saves
      setOpenKey(savedWant);
    }
  }, [savedWant]);
  // Keep the native/new-tab URL unpinned. /nearby resolves the canonical
  // scope cookie first and the home preference second, so normal clicks and
  // modified/no-JS clicks cannot answer from different towns.
  const hrefFor = (href: string): string => href;

  const openCat = WANTS.find((c) => c.key === openKey) ?? WANTS[0];
  const accent = openCat.color;
  const isEat = Boolean(openCat.mealLead);
  const visibleSubs: WantSub[] = isEat
    ? [
        {
          label: `${meal.label} now`,
          icon: "UtensilsCrossed",
          href: `/nearby?c=${meal.key}`,
        },
        ...openCat.subs,
      ]
    : openCat.subs;

  const answerOpenerRef = useRef<HTMLElement | null>(null);
  const openAnswer = (
    want: { c: string; facet: string | null },
    label: string,
    opener: HTMLElement,
  ) => {
    haptic("light");
    touchedRef.current = true;
    answerOpenerRef.current = opener;
    setAnswer({ ...want, label });
    reflectWantInUrl(want);
  };
  const dismissAnswer = (restoreFocus: boolean) => {
    const opener = answerOpenerRef.current;
    setAnswer(null);
    reflectWantInUrl(null);
    if (restoreFocus) queueMicrotask(() => opener?.focus());
    else answerOpenerRef.current = null;
  };
  const closeAnswer = () => dismissAnswer(true);

  /** Warm only the answer request that an inline link actually consumes.
   *  Next's route prefetch is disabled for those links because their click is
   *  intercepted and never navigates to /nearby or /category. */
  const warmTarget = (href: string) => {
    const w = inlineWantFor(href);
    if (w) prefetchWant(w.c, w.facet);
    else router.prefetch(hrefFor(href));
  };

  /** Warm the answer the instant a finger lands on an inline chip, before the
   *  click resolves and the panel mounts, so the network round trip overlaps
   *  the tap gesture instead of following it. No-op for non-inline links. */
  const prefetchOnIntent = (href: string) => () => warmTarget(href);

  /** Intercept a /nearby-style link into the inline panel; modified clicks
   *  (new tab, middle click) keep their native navigation. */
  const interceptWant = (href: string, label: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    const w = inlineWantFor(href);
    if (!w || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      haptic("light");
      return;
    }
    e.preventDefault();
    // Tapping the already-open chip folds the panel — the toggle read.
    if (answer && answer.c === w.c && answer.facet === w.facet) closeAnswer();
    else openAnswer(w, label, e.currentTarget);
  };

  const promote = (key: string) => {
    haptic("light");
    touchedRef.current = true;
    const promoted = WANTS.find((cat) => cat.key === key);
    const promotedHero = promoted?.mealLead
      ? `/nearby?c=${meal.key}`
      : promoted
        ? promoted.subs[0]?.href
        : null;
    if (promotedHero) warmTarget(promotedHero);
    setOpenKey(key);
    dismissAnswer(false);
  };

  return (
    <div className="space-y-2.5">
      <div className="pb-0.5">
        <div className="flex flex-wrap gap-x-1.5 gap-y-2" role="group" aria-label="Quick actions">
          {WANTS.map((cat) => {
            const active = cat.key === openCat.key;
            return (
              <button
                key={cat.key}
                type="button"
                aria-pressed={active}
                onClick={() => promote(cat.key)}
                className="tap-44 tactile-interactive inline-flex shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold"
                style={{
                  borderColor: active
                    ? `color-mix(in srgb, ${cat.color} 62%, var(--app-border))`
                    : "var(--app-border)",
                  background: active
                    ? `color-mix(in srgb, ${cat.color} 16%, var(--app-bg-elevated-solid))`
                    : "var(--app-bg-elevated)",
                  color: "var(--app-ink)",
                  boxShadow: active ? "var(--app-hi)" : "none",
                }}
              >
                <span aria-hidden style={{ color: `color-mix(in srgb, ${cat.color} 78%, var(--app-ink))` }}>
                  {renderIcon(cat.icon, "h-4 w-4")}
                </span>
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* The active category's answers form one second, quieter row. A
          /nearby-style chip answers INLINE below; the active one reads as
          pressed. Curated-page chips (/brunch, /parks) navigate as ever. */}
      <div className="pb-1">
        <div className="flex flex-wrap gap-x-1.5 gap-y-2" role="group" aria-label={`${openCat.label} choices`}>
        {visibleSubs.map((sub: WantSub) => {
          const w = inlineWantFor(sub.href);
          const active = Boolean(
            answer && w && answer.c === w.c && answer.facet === w.facet,
          );
          return (
            <Link
              key={sub.href + sub.label}
              href={hrefFor(sub.href)}
              prefetch={false}
              onMouseEnter={prefetchOnIntent(sub.href)}
              onFocus={prefetchOnIntent(sub.href)}
              onPointerDown={prefetchOnIntent(sub.href)}
              onClick={interceptWant(sub.href, sub.label)}
              aria-expanded={w ? active : undefined}
              className="tap-44 tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold"
              style={{
                borderColor: active ? `color-mix(in srgb, ${accent} 55%, var(--app-border))` : "transparent",
                background: active
                  ? `color-mix(in srgb, ${accent} 16%, var(--app-bg-elevated-solid))`
                  : "var(--app-bg-sunken)",
                color: "var(--app-ink)",
                boxShadow: "none",
              }}
            >
              <span aria-hidden style={{ color: `color-mix(in srgb, ${accent} 78%, var(--app-ink))` }}>
                {renderIcon(sub.icon, "h-4 w-4")}
              </span>
              {sub.label}
            </Link>
          );
        })}
        </div>
      </div>

      {/* The inline answer — places for the tapped chip, no navigation. */}
      {answer && (
        <WantAnswerPanel
          cKey={answer.c}
          facet={answer.facet}
          label={answer.label}
          accent={accent}
          onClose={closeAnswer}
        />
      )}

    </div>
  );
}
