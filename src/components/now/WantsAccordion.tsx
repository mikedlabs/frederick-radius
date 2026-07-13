"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
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
  ChevronRight,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { WANTS, type WantSub } from "@/data/wants";
import { GLYPHS } from "@/components/glyphs";
import { getHomeMuni } from "@/lib/personalize";
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
  Church, Pill,
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
 * The lead answer for each main category — the one obvious primary action the
 * hero card offers. Eat is time-aware (computed from the meal), so it lives in
 * the component; the rest are the category's most useful landing plus a plain
 * few-words sub that names what's inside. Keys match WANTS[].key.
 */
const HERO: Record<string, { title: string; sub: string; href: string }> = {
  drink: { title: "Grab a drink", sub: "Bars, breweries, happy hour", href: "/nearby?c=drinks" },
  outdoors: { title: "Get outside", sub: "Parks, trails, rivers", href: "/parks" },
  seedo: { title: "Find something to do", sub: "Live music, arts, family fun", href: "/nearby?c=family" },
  shop: { title: "Go shopping", sub: "Shops, markets, vintage", href: "/nearby?c=shops" },
  unwind: { title: "Wind down", sub: "Wellness, salons, a place to stay", href: "/nearby?c=wellness" },
  community: { title: "Community", sub: "Worship, libraries, pharmacies", href: "/contacts" },
  around: { title: "Get around", sub: "Parking, transit, amenities", href: "/parking" },
};

/**
 * WantsAccordion — the "I want…" fast lane, v2 ("lead + the rest").
 *
 * ONE primary action leads: a big hero card for the moment's best move (Eat
 * opens by default and leads with the time-aware "Restaurants open for dinner
 * now"), with that category's subcategories as a chip row beneath it. The other
 * mains sit quiet below as a compact two-column list; tapping one promotes it to
 * the hero. This replaces the flat 8-tile grid where every choice shouted
 * equally — now typography and hierarchy carry the page, one answer at a time.
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
  // Home town (read post-mount, client-only). When set, geo-aware /nearby
  // answers default to that town. Curated/page links are left alone.
  const [homeSlug, setHomeSlug] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage read; SSR can't see the home town
    setHomeSlug(getHomeMuni());
  }, []);
  const hrefFor = (href: string): string =>
    homeSlug && href.startsWith("/nearby?c=") ? `${href}&town=${homeSlug}` : href;

  const openCat = WANTS.find((c) => c.key === openKey) ?? WANTS[0];
  const accent = openCat.color;
  const isEat = Boolean(openCat.mealLead);

  // The hero's primary action. Eat is meal-aware; the rest come from HERO.
  const hero = isEat
    ? {
        title: "Restaurants open now",
        sub: `Open ${meal.phrase} near you`,
        href: `/nearby?c=${meal.key}`,
      }
    : HERO[openCat.key] ?? {
        title: openCat.label,
        sub: openCat.subs.slice(0, 3).map((s) => s.label).join(", "),
        href: openCat.subs[0]?.href ?? "/find",
      };

  const rest = WANTS.filter((c) => c.key !== openCat.key);

  const openAnswer = (want: { c: string; facet: string | null }, label: string) => {
    haptic("light");
    touchedRef.current = true;
    setAnswer({ ...want, label });
    reflectWantInUrl(want);
  };
  const closeAnswer = () => {
    setAnswer(null);
    reflectWantInUrl(null);
  };

  /** Warm the answer the instant a finger lands on an inline chip, before the
   *  click resolves and the panel mounts, so the network round trip overlaps
   *  the tap gesture instead of following it. No-op for non-inline links. */
  const prefetchOnPress = (href: string) => () => {
    const w = inlineWantFor(href);
    if (w) prefetchWant(w.c, w.facet);
  };

  /** Intercept a /nearby-style link into the inline panel; modified clicks
   *  (new tab, middle click) keep their native navigation. */
  const interceptWant = (href: string, label: string) => (e: React.MouseEvent) => {
    const w = inlineWantFor(href);
    if (!w || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      haptic("light");
      return;
    }
    e.preventDefault();
    // Tapping the already-open chip folds the panel — the toggle read.
    if (answer && answer.c === w.c && answer.facet === w.facet) closeAnswer();
    else openAnswer(w, label);
  };

  const promote = (key: string) => {
    haptic("light");
    touchedRef.current = true;
    setOpenKey(key);
    closeAnswer();
  };

  return (
    <div className="space-y-2.5">
      {/* Hero — one primary action for the open category. */}
      <Link
        href={hrefFor(hero.href)}
        onPointerDown={prefetchOnPress(hero.href)}
        onClick={interceptWant(hero.href, isEat ? meal.label : openCat.label)}
        className="tactile-interactive relative flex items-center gap-3.5 overflow-hidden rounded-[var(--app-radius-lg)] p-4"
        style={{
          background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 20%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid))`,
          backgroundImage: "var(--app-paper-light)",
          border: `1px solid color-mix(in srgb, ${accent} 45%, var(--app-border))`,
          boxShadow: "var(--app-elev-2), var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[13px]"
          style={{
            background: `color-mix(in srgb, ${accent} 26%, var(--app-bg-elevated))`,
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 10%, transparent), 0 0 0 3px var(--app-bg-elevated-solid), var(--app-hi)",
            color: `color-mix(in srgb, ${accent} 86%, var(--app-ink))`,
          }}
        >
          {renderIcon(openCat.icon, "h-7 w-7")}
        </span>
        <span className="min-w-0 flex-1">
          {isEat && (
            <span
              className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: `color-mix(in srgb, ${accent} 72%, var(--app-ink))` }}
            >
              {meal.label} · now
            </span>
          )}
          <span className="mt-0.5 block truncate font-serif text-[20px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {hero.title}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
            {hero.sub}
          </span>
        </span>
        <ArrowRight
          aria-hidden
          className="h-5 w-5 shrink-0"
          strokeWidth={2.2}
          style={{ color: `color-mix(in srgb, ${accent} 80%, var(--app-ink))` }}
        />
      </Link>

      {/* The open category's subcategories, as a scannable chip row. A
          /nearby-style chip answers INLINE below; the active one reads as
          pressed. Curated-page chips (/brunch, /parks) navigate as ever. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Narrow ${openCat.label}`}>
        {openCat.subs.map((sub: WantSub) => {
          const w = inlineWantFor(sub.href);
          const active = Boolean(
            answer && w && answer.c === w.c && answer.facet === w.facet,
          );
          return (
            <Link
              key={sub.href + sub.label}
              href={hrefFor(sub.href)}
              onPointerDown={prefetchOnPress(sub.href)}
              onClick={interceptWant(sub.href, sub.label)}
              aria-expanded={w ? active : undefined}
              className="tap-44-y tactile-interactive inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12.5px] font-semibold"
              style={{
                border: `1px solid ${active ? `color-mix(in srgb, ${accent} 55%, var(--app-border))` : "var(--app-border)"}`,
                background: active
                  ? `color-mix(in srgb, ${accent} 16%, var(--app-bg-elevated-solid))`
                  : "var(--app-bg-elevated)",
                color: "var(--app-ink)",
                boxShadow: active ? "var(--app-hi)" : "var(--app-elev-1), var(--app-hi)",
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

      {/* The rest — quiet two-column list; tap to promote to the hero. */}
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        {rest.map((cat) => {
          const ink = cat.color;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => promote(cat.key)}
              className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2.5 text-left"
              style={{
                border: "1px solid var(--app-border)",
                background: "var(--app-bg-elevated)",
                boxShadow: "var(--app-elev-1), var(--app-hi)",
              }}
            >
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
                style={{
                  background: `color-mix(in srgb, ${ink} 14%, var(--app-bg-elevated))`,
                  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent), var(--app-hi)",
                  color: `color-mix(in srgb, ${ink} 76%, var(--app-ink))`,
                }}
              >
                {renderIcon(cat.icon, "h-[18px] w-[18px]")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                {cat.label}
              </span>
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-30" style={{ color: "var(--app-ink-3)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
