"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disc, Sun, Map, Calendar, BookOpen } from "lucide-react";
import { haptic } from "@/lib/haptics";

// Primary destinations. Five tabs — added /places (the directory)
// because there was no top-down browsing entry point: a stranger
// could land on /today (curated rails) or /map (visual) but had no
// way to see the directory's breadth by category × town without
// already knowing what they wanted.
// Saved moved to the header (TopBar) as a bookmark icon; Plan
// absorbed into Radius (the two answered the same intent and split
// attention). /plan + /saved routes stay alive — just not tabs.
const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/places", label: "Places", icon: BookOpen },
  // Per the master UI brief: route stays /radius (a product mechanic
  // name), the visible label is "Near Me" (a user need name). The
  // mechanic-name shows up in URLs, the user-need name shows up in
  // the nav where it's read by a person making a decision.
  { href: "/radius", label: "Near Me", icon: Disc },
  { href: "/map", label: "Map", icon: Map },
  { href: "/events", label: "Events", icon: Calendar },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  // Index of the active tab. Used to position the sliding indicator
  // bar at the top of the nav; falls back to 0 so the bar still has
  // a home even on routes that aren't a primary tab (e.g. /saved,
  // /settings, /about) — it just stays parked under "Today" until the
  // user moves.
  const activeIdx = Math.max(
    0,
    TABS.findIndex(
      (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
    ),
  );
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-bg-elevated)]/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      {/* Sliding indicator bar — a thin brand-tinted strip that slides
          horizontally between tabs as the route changes. Uses CSS
          transform (not left/width) so it animates on the compositor.
          A subtle glow underneath gives the bar a soft halo that
          tracks with it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10 h-[2.5px] origin-left rounded-b-full"
        style={{
          width: `${100 / TABS.length}%`,
          background:
            "linear-gradient(90deg, transparent 0%, var(--app-brand) 18%, var(--app-brand) 82%, transparent 100%)",
          transform: `translateX(${activeIdx * 100}%)`,
          transition: "transform 320ms var(--app-ease-spring)",
          boxShadow: "0 4px 12px -2px color-mix(in srgb, var(--app-brand) 45%, transparent)",
        }}
      />
      <ul className="mx-auto grid max-w-screen-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                onClick={() => {
                  // Quiet feedback on every tab tap. Skip the haptic
                  // when re-tapping the active tab so there's no
                  // false "switched" signal on a no-op nav.
                  if (!active) haptic("light");
                }}
                className="group relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-semibold tracking-tight transition-transform active:scale-[0.92]"
                style={{
                  color: active ? "var(--app-brand)" : "var(--app-ink-3)",
                  transitionTimingFunction: "var(--app-ease-spring)",
                  transitionDuration: "var(--app-dur-fast)",
                }}
                aria-current={active ? "page" : undefined}
              >
                {/* Icon pill — active gets a brand-tinted background with
                    the new tactile-glow-brand layered shadow + lip, so the
                    selected tab visibly lifts and catches light. Inactive
                    stays flat ink-3 and lifts on hover (desktop only). */}
                <span
                  className={`grid h-9 w-[52px] place-items-center rounded-full transition-all duration-200 ${
                    active ? "tactile tactile-lift tactile-glow-brand" : ""
                  }`}
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--app-brand) 18%, var(--app-bg-elevated))"
                      : "transparent",
                    transitionTimingFunction: "var(--app-ease-spring)",
                  }}
                  aria-hidden
                >
                  <Icon
                    className={`transition-transform duration-200 ${
                      active ? "h-[20px] w-[20px]" : "h-[19px] w-[19px] group-hover:-translate-y-[1px]"
                    }`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                </span>
                <span
                  className="transition-opacity"
                  style={{ opacity: active ? 1 : 0.85 }}
                >
                  {label}
                </span>
                {/* Active indicator dot — small brand chip beneath the
                    label so the selected route reads clearly even when
                    glancing at the nav peripherally. */}
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full transition-opacity"
                  style={{
                    background: "var(--app-brand)",
                    opacity: active ? 1 : 0,
                  }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
