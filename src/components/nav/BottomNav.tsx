"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";
import { useHideOnScroll } from "./useHideOnScroll";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useHideOnScroll(false);

  // Real index from the current route, or -1 when the page isn't under
  // any tab (a place detail, /settings, /about…). We deliberately do
  // NOT fall back to 0 — that's what made every non-tab page falsely
  // light up "Today". At -1 the moving pill simply hides (the measure
  // effect finds no cell), so no tab is mis-highlighted.
  const realIdx = tabIndexForPath(pathname);

  // Optimistic index. Set on pointer-down so the indicator slides
  // within one frame, before the server-side route work begins. The
  // reconcile effect below clears it when the real route catches up,
  // which collapses the optimistic state cleanly.
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  useEffect(() => {
    // The pathname only changes after navigation completes. When it
    // does, the optimistic state has done its job and can retire.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset optimistic state once the actual route change completes; the pathname dep is the signal
    setPendingIdx(null);
  }, [pathname]);

  const activeIdx = pendingIdx ?? realIdx;

  // Measure the tab strip + active tab so the indicator pill can sit
  // EXACTLY behind the active chip. Recomputes on resize and on
  // active-tab change. Using a measured pill instead of a CSS-only
  // "100% / 5" calc lets us pad the pill smaller than the tab cell
  // so it reads as a chip behind the icon, not a full-column slab.
  const stripRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  useEffect(() => {
    function measure() {
      const strip = stripRef.current;
      const cell = tabRefs.current[activeIdx];
      if (!strip) return;
      // A detail/settings route belongs to no primary tab. Explicitly hide
      // the pill instead of leaving it parked under the tab from the previous
      // route (which made that tab look active while aria-current said none).
      if (!cell) {
        setPill((current) => current.width === 0 ? current : { left: 0, width: 0 });
        return;
      }
      const sBox = strip.getBoundingClientRect();
      const cBox = cell.getBoundingClientRect();
      // Pad the pill to roughly the chip width — 48px wide centered
      // on the cell's icon, clamped to the cell.
      const pillW = Math.min(54, cBox.width - 8);
      const left = cBox.left - sBox.left + (cBox.width - pillW) / 2;
      setPill({ left, width: pillW });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIdx]);

  // Ask is a focused decision workspace with its own Back control. The fixed
  // pill otherwise covers the first source heading as soon as an answer lands,
  // precisely when the visitor is trying to verify it.
  if (pathname.startsWith("/ask")) return null;

  // Find, at the nav's center (owner call 2026-07-21). History note: the old
  // center "Mark" (+) was removed 2026-07-01 because a LOW-frequency action
  // shouted louder than the answers. Find is the opposite case — the single
  // highest-frequency intent in the app — which is what earns center
  // prominence (frequency, not novelty; INTERACTION_CRAFT rule 4). It opens
  // the ONE global search overlay via the existing fr:open-search bridge
  // (TopBar's listener is unconditional, so this works on /map and /search
  // too) — no second search implementation.
  const findCell = (
    <li key="find" className="flex items-center justify-center">
      <button
        type="button"
        aria-label="Find places, events, towns, tools"
        aria-haspopup="dialog"
        onClick={() => {
          haptic("light");
          window.dispatchEvent(new CustomEvent("fr:open-search"));
        }}
        className="grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-[0.92]"
        style={{
          background: "linear-gradient(155deg, var(--app-brand), var(--app-brand-press))",
          color: "var(--app-on-brand)",
          boxShadow:
            "0 6px 14px -6px color-mix(in srgb, var(--app-brand) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        <Search width={20} height={20} strokeWidth={2.4} aria-hidden />
      </button>
    </li>
  );

  return (
    <div
      // Hide the floating bottom pill at lg+ where the SideRail takes
      // over as the primary nav. The hide is `display:none` (lg:hidden),
      // which removes this nav from the a11y tree AND the tab order at
      // lg+, so only one "Primary" nav is ever exposed. NOTE: do not put
      // aria-hidden on this wrapper — it contains the focusable <nav>, so
      // aria-hidden here would hide the mobile primary nav from screen
      // readers while leaving its links keyboard-focusable (a WCAG
      // focusable-inside-aria-hidden failure the audit flagged).
      className="pointer-events-none fixed inset-x-0 bottom-0 lg:hidden"
      // Tokenized z-index (--z-nav) — see globals.css :root --z-*
      // scale. Lift the pill above the iOS safe-area inset so the
      // nav doesn't sit on top of the home indicator. Horizontal padding
      // is max(base, side-inset): on a notched phone in LANDSCAPE the
      // notch sits on a side edge, so without this the pill's end could be
      // clipped by the notch. max() keeps the 0.75rem base on every
      // non-notched device (and in portrait, where the side insets are 0),
      // so it only ever adds room where the notch would otherwise clip.
      // In-and-out on scroll, breathing WITH the TopBar (one shared scroll
      // signal): reading pushes both bars away, a small upward swipe brings
      // them back. The pill dips below the safe-area inset with a spring ease
      // and a touch of scale, so the return reads as a rise, not a teleport.
      style={{
        zIndex: "var(--z-nav)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
        transform: hidden
          ? "translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 14px)) scale(0.98)"
          : "translateY(0) scale(1)",
        transition: "transform var(--app-dur-med) var(--app-ease-spring)",
        willChange: "transform",
      }}
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative mx-auto max-w-screen-md overflow-hidden rounded-full"
        style={{
          // Fully opaque so scroll content never ghosts through the pill
          // (the audit caught tiles/headers bleeding at 92%). Blur kept for
          // a faint frosted edge; with a solid fill it's purely aesthetic.
          background: "var(--app-bg-elevated-solid)",
          backdropFilter: "blur(22px) saturate(1.15)",
          WebkitBackdropFilter: "blur(22px) saturate(1.15)",
          border: "1px solid var(--app-border)",
          boxShadow:
            "0 10px 28px -8px rgba(20,20,18,0.22), 0 2px 6px rgba(20,20,18,0.10), var(--app-edge), var(--app-hi)",
        }}
      >
        {/* Moving brand pill — sits BEHIND the active tab's icon. CSS
            transform on `left/width` so the pill morphs between cells
            with the same spring easing the indicator bar used before.
            The pill carries the brand color + glow; the icon and
            label ride on top with brand ink color when active. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-0 h-10 -translate-y-1/2 rounded-full"
          style={{
            left: pill.left,
            width: pill.width,
            background:
              "linear-gradient(155deg, color-mix(in srgb, var(--app-brand) 22%, var(--app-bg-elevated)) 0%, color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated)) 100%)",
            boxShadow:
              "0 6px 16px -6px color-mix(in srgb, var(--app-brand) 50%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--app-brand) 28%, transparent)",
            transition:
              "left 320ms var(--app-ease-spring), width 320ms var(--app-ease-spring), opacity 200ms ease",
            opacity: pill.width > 0 ? 1 : 0,
          }}
        />

        <ul
          ref={stripRef}
          className="relative z-10 mx-auto grid max-w-screen-md grid-cols-5 px-1.5 py-1.5"
        >
          {TABS.map(({ href, label, icon: Icon, fillOnActive }, idx) => {
            const isRealActive =
              pathname === href || pathname.startsWith(href + "/");
            const isPendingActive = pendingIdx === idx;
            const active = isRealActive || isPendingActive;

            const handleActivate = (e?: { preventDefault?: () => void }) => {
              if (isRealActive) return;
              setPendingIdx(idx);
              haptic("light");
              if (e && typeof document !== "undefined" && "startViewTransition" in document) {
                e.preventDefault?.();
                const doc = document as Document & {
                  startViewTransition?: (cb: () => void) => unknown;
                };
                doc.startViewTransition?.(() => router.push(href));
              }
            };

            const tabClass =
              "group relative flex h-12 flex-col items-center justify-center gap-1 rounded-full text-center transition-transform active:scale-[0.92]";
            const tabStyle = {
              // brand-press, not brand: the 11px active label sits on a faint
              // brand tint over cream where #E14328 is only ~3.3:1 (fails AA);
              // #B5300F clears it (2026-07 shell-hardening P4).
              color: active ? "var(--app-brand-press)" : "var(--app-ink-3)",
              transitionTimingFunction: "var(--app-ease-spring)",
              transitionDuration: "var(--app-dur-fast)",
            } as const;

            const cell = (
              <li
                key={href}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                className="flex"
              >
                <Link
                  href={href}
                  prefetch={false}
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  onPointerDown={() => {
                    if (!isRealActive) setPendingIdx(idx);
                  }}
                  onClick={(e) => handleActivate(e)}
                  className={tabClass + " w-full"}
                  style={tabStyle}
                  // Optimistic color/position can move immediately, but only
                  // the route the user is actually on is the current page.
                  aria-current={isRealActive ? "page" : undefined}
                >
                  <Icon
                    className="transition-transform duration-200"
                    width={active ? 22 : 20}
                    height={active ? 22 : 20}
                    strokeWidth={active ? 2.25 : 2}
                    fill={active && fillOnActive ? "currentColor" : "none"}
                    style={{
                      transform: active ? "translateY(-1px) scale(1.04)" : "translateY(0)",
                      transitionTimingFunction: "var(--app-ease-spring)",
                    }}
                  />
                  <span
                    className="text-[11px] font-medium leading-tight tracking-tight"
                    style={{ opacity: 1 }}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );

            // Find rides the center slot, between Map and Events (the findCell
            // comment above carries the why + the Mark-removal history).
            return idx === 1 ? (
              <Fragment key={href}>
                {cell}
                {findCell}
              </Fragment>
            ) : (
              cell
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
