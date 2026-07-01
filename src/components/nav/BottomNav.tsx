"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

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
      if (!strip || !cell) return;
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
      style={{
        zIndex: "var(--z-nav)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
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
              color: active ? "var(--app-brand)" : "var(--app-ink-3)",
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
                  onPointerDown={() => {
                    if (!isRealActive) setPendingIdx(idx);
                  }}
                  onClick={(e) => handleActivate(e)}
                  className={tabClass + " w-full"}
                  style={tabStyle}
                  aria-current={active ? "page" : undefined}
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

            // After the 2nd tab, inject the prominent center "Mark" action —
            // the public community-report tool — so the nav has a focal CTA
            // instead of dead center space. It's an ACTION, not a tab: it never
            // takes the moving highlight pill (tabRefs only track the 4 tabs).
            if (idx === 1) {
              return (
                <Fragment key="mark-slot">
                  {cell}
                  <li key="mark" className="flex items-center justify-center">
                    <Link
                      href="/report"
                      onPointerDown={() => haptic("light")}
                      aria-label="Mark a spot: a hazard, condition, tip, or note"
                      className="group flex h-12 flex-col items-center justify-center gap-1 text-center"
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-full text-white transition-transform active:scale-[0.9] group-active:scale-[0.9]"
                        style={{
                          background: "var(--app-brand)",
                          boxShadow:
                            "0 6px 16px -6px color-mix(in srgb, var(--app-brand) 60%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--app-brand) 30%, transparent)",
                        }}
                      >
                        <Plus width={20} height={20} strokeWidth={2.75} aria-hidden />
                      </span>
                      <span
                        className="text-[11px] font-semibold leading-tight tracking-tight"
                        style={{ color: "var(--app-brand)" }}
                      >
                        Mark
                      </span>
                    </Link>
                  </li>
                </Fragment>
              );
            }
            return cell;
          })}
        </ul>
      </nav>
    </div>
  );
}
