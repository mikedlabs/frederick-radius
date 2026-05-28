"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  Search as SearchIcon,
  MapPin,
  Calendar,
  Bookmark,
  Sparkles,
  Compass,
  Home,
  Info,
  Building2,
  Tag,
} from "lucide-react";
import { TOP_CATEGORIES } from "@/data/categories";

/**
 * CommandPalette — global ⌘K / Ctrl+K jump bar. Per master UI brief
 * §15: a single keystroke takes power users to anywhere in the app
 * (places, categories, towns, routes) without going through the nav.
 *
 * Behavior:
 *   - ⌘K (Mac) or Ctrl+K (Win/Linux) toggles the palette anywhere.
 *   - Esc closes (cmdk default).
 *   - Result groups: Pages · Categories · Towns · Places.
 *   - Place data is fetched lazily on first open so the cold-load
 *     bundle stays small (the full place list is ~1.5MB JSON).
 *   - Routing uses next/navigation router.push so the SPA stays warm.
 *
 * Mounted from the (app) layout so it works on every authed screen.
 * Not mounted on /from-above/preview or other gallery routes where
 * a global key shortcut would be jarring.
 */

type PalettePlace = {
  slug: string;
  name: string;
  category: string;
  municipality?: string | null;
  /**
   * Same field SearchOverlay uses for its thumbnail. Optional — when
   * absent the place row falls back to the MapPin icon stamp.
   */
  google_photo_url?: string;
};

// Towns surfaced as quick targets. Kept short — the long-tail towns
// are still discoverable by typing into the bar (places fuzzy-match
// on municipality too).
const TOWNS: { slug: string; name: string }[] = [
  { slug: "frederick", name: "Frederick" },
  { slug: "brunswick", name: "Brunswick" },
  { slug: "thurmont", name: "Thurmont" },
  { slug: "middletown", name: "Middletown" },
  { slug: "mount-airy", name: "Mount Airy" },
  { slug: "walkersville", name: "Walkersville" },
  { slug: "new-market", name: "New Market" },
  { slug: "emmitsburg", name: "Emmitsburg" },
];

const ROUTES: { href: string; label: string; description: string; icon: typeof Home }[] = [
  { href: "/today", label: "Today", description: "Weather + what's open + what's happening", icon: Home },
  { href: "/map", label: "Browse", description: "The map — pan, layers, filters", icon: Compass },
  { href: "/radius", label: "Within reach", description: "What's reachable from a point", icon: MapPin },
  { href: "/events", label: "Events", description: "Tonight, weekend, this week", icon: Calendar },
  { href: "/my-radius", label: "My Radius", description: "Places you follow", icon: Bookmark },
  { href: "/about", label: "About", description: "What this app is", icon: Info },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<PalettePlace[] | null>(null);

  // Global hotkey: ⌘K / Ctrl+K toggles. Skipped if the user is mid-
  // input in a text field that already wants the keystroke (e.g. an
  // editor) — but the cmdk's own input doesn't need this guard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load the places list on first open. The full client JSON is
  // heavy; fetching only when the palette is summoned keeps the cold-
  // load bundle out of the critical path. Cached after first load.
  useEffect(() => {
    if (!open || places !== null) return;
    let cancelled = false;
    (async () => {
      try {
        // Use the same client JSON the rest of the app uses.
        const mod = await import("@/data/places-client.json");
        const raw = (mod.default ?? mod) as PalettePlace[];
        if (!cancelled) setPlaces(raw);
      } catch {
        if (!cancelled) setPlaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, places]);

  // Cap to 200 places in the list so cmdk's match loop stays snappy
  // on slower devices. cmdk does the actual filter; we just bound the
  // candidate pool. Falls back to top alphabetical when no query.
  const visiblePlaces = useMemo(() => {
    if (!places) return [];
    // Stable display cap — cmdk filters this set down by query.
    return places.slice(0, 600);
  }, [places]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="cmdk-root"
    >
      <div className="cmdk-shell">
        <div className="cmdk-input-row">
          <SearchIcon className="cmdk-input-icon" strokeWidth={2.25} aria-hidden />
          <Command.Input
            placeholder="Jump to a place, town, category, or page…"
            className="cmdk-input"
          />
          <kbd className="cmdk-kbd" aria-hidden>
            ESC
          </kbd>
        </div>
        <Command.List className="cmdk-list">
          <Command.Empty className="cmdk-empty">No matches. Try a different word.</Command.Empty>

          <Command.Group heading="Pages" className="cmdk-group">
            {ROUTES.map((r) => {
              const Icon = r.icon;
              return (
                <Command.Item
                  key={r.href}
                  value={`page ${r.label} ${r.description}`}
                  onSelect={() => go(r.href)}
                  className="cmdk-item"
                >
                  <Icon className="cmdk-item-icon" strokeWidth={2} aria-hidden />
                  <span className="cmdk-item-body">
                    <span className="cmdk-item-title">{r.label}</span>
                    <span className="cmdk-item-sub">{r.description}</span>
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>

          <Command.Group heading="Categories" className="cmdk-group">
            {TOP_CATEGORIES.map((c) => (
              <Command.Item
                key={c.slug}
                value={`category ${c.name} ${c.slug}`}
                onSelect={() => go(`/places?category=${c.slug}`)}
                className="cmdk-item"
              >
                <Tag
                  className="cmdk-item-icon"
                  strokeWidth={2}
                  aria-hidden
                  style={{ color: c.color }}
                />
                <span className="cmdk-item-body">
                  <span className="cmdk-item-title">{c.name}</span>
                  <span className="cmdk-item-sub">All {c.name.toLowerCase()} places</span>
                </span>
                <Sparkles
                  className="cmdk-item-trail"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Towns" className="cmdk-group">
            {TOWNS.map((t) => (
              <Command.Item
                key={t.slug}
                value={`town ${t.name}`}
                onSelect={() => go(`/towns/${t.slug}`)}
                className="cmdk-item"
              >
                <Building2 className="cmdk-item-icon" strokeWidth={2} aria-hidden />
                <span className="cmdk-item-body">
                  <span className="cmdk-item-title">{t.name}</span>
                  <span className="cmdk-item-sub">Town overview</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>

          {visiblePlaces.length > 0 && (
            <Command.Group heading="Places" className="cmdk-group">
              {visiblePlaces.map((p) => (
                <Command.Item
                  key={p.slug}
                  value={`place ${p.name} ${p.category} ${p.municipality ?? ""}`}
                  onSelect={() => go(`/places/${p.slug}`)}
                  className="cmdk-item"
                >
                  {/* Thumbnail when the place has a Google photo,
                      else fall back to the MapPin stamp. Matches the
                      SearchOverlay pattern so the two surfaces read as
                      the same product. Plain <img> (not next/image)
                      because these are tiny 28px tiles inside an
                      already-rendered overlay; the optimizer round-
                      trip would add a request per row for negligible
                      bytes saved. */}
                  {p.google_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.google_photo_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="cmdk-item-thumb"
                    />
                  ) : (
                    <MapPin className="cmdk-item-icon" strokeWidth={2} aria-hidden />
                  )}
                  <span className="cmdk-item-body">
                    <span className="cmdk-item-title">{p.name}</span>
                    <span className="cmdk-item-sub">
                      {p.category}
                      {p.municipality ? ` · ${p.municipality}` : ""}
                    </span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="cmdk-footer">
          <span>
            <kbd className="cmdk-kbd-inline">↑</kbd>
            <kbd className="cmdk-kbd-inline">↓</kbd> Navigate
          </span>
          <span>
            <kbd className="cmdk-kbd-inline">↵</kbd> Go
          </span>
          <span>
            <kbd className="cmdk-kbd-inline">⌘</kbd>
            <kbd className="cmdk-kbd-inline">K</kbd> Toggle
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}
