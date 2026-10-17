"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { shouldPrefetchGlobalNavigation } from "@/lib/fair/route-policy";
import { TABS, tabIndexForPath } from "./tabs";
import styles from "./NavChrome.module.css";

type NavigationGesture = Pick<
  MouseEvent,
  "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function isPlainPrimaryNavigation(event: NavigationGesture): boolean {
  return event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function shouldShowBottomNav(
  _pathname: string,
  contextualActionBarPresent = false,
): boolean {
  return !contextualActionBarPresent;
}

/**
 * Mobile primary navigation as a compact field-guide index strip.
 *
 * Four stable destinations sit on a raised Cream strip. The selected
 * destination has a filled Brick control, while search keeps its single
 * doorway in the page or top bar.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const realIdx = tabIndexForPath(pathname);
  const allowPrefetch = shouldPrefetchGlobalNavigation(pathname);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const onMap = pathname === "/map";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname completion clears the optimistic destination
    setPendingIdx(null);
  }, [pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!onMap || !nav) return;
    const root = document.documentElement;
    const property = "--app-tabbar-h";
    const previous = root.style.getPropertyValue(property);
    const previousPriority = root.style.getPropertyPriority(property);
    let published: string | null = null;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      // The strip itself, not the shell's safe-area padding. Map clearance
      // adds that inset separately so it is never counted twice.
      const height = nav.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      const value = `${Math.round(height)}px`;
      if (root.style.getPropertyValue(property) !== value) {
        root.style.setProperty(property, value);
      }
      published = value;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (published !== null && root.style.getPropertyValue(property) === published) {
        if (previous) root.style.setProperty(property, previous, previousPriority);
        else root.style.removeProperty(property);
      }
    };
  }, [onMap]);

  if (!shouldShowBottomNav(pathname)) return null;

  return (
    <>
      {/* CSS owns the streamed-page handoff: as soon as a contextual bar
          appears, the normal nav is not painted or exposed to assistive tech.
          It stays in the React tree so a streamed detail-to-list transition
          cannot strand the next page without primary navigation. */}
      <style>{`
        @media (max-width: 63.999rem) {
          html:has([data-mobile-action-bar]) [data-bottom-nav-shell] {
            display: none;
          }
        }
      `}</style>
      <div
        data-bottom-nav-shell
        data-map-bottom-nav={onMap ? "true" : undefined}
        className="pointer-events-none fixed inset-x-0 bottom-0 lg:hidden"
        style={{
          zIndex: "var(--z-nav)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          paddingLeft: "max(0.5rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <nav
          ref={navRef}
          aria-label="Primary"
          aria-busy={pendingIdx !== null}
          data-app-tabbar
          className={`${styles.dock} pointer-events-auto relative mx-auto max-w-screen-md overflow-hidden`}
        >
          <ul className={`mx-auto grid max-w-screen-md grid-cols-4 px-1 ${onMap ? "py-[4px]" : "py-1"}`}>
            {TABS.map(({ href, label, icon: Icon, prefetch, fillOnActive }, idx) => {
              const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
              const isRealActive = realIdx === idx;
              // A requested destination is pending until its pathname commits.
              const active = isRealActive;

              const handleActivate = (event: React.MouseEvent<HTMLAnchorElement>) => {
                if (isAtDestination || !isPlainPrimaryNavigation(event.nativeEvent)) {
                  setPendingIdx(null);
                  return;
                }
                setPendingIdx(idx);
                haptic("light");
                if (typeof document !== "undefined" && "startViewTransition" in document) {
                  event.preventDefault();
                  const doc = document as Document & {
                    startViewTransition?: (callback: () => void) => unknown;
                  };
                  doc.startViewTransition?.(() => router.push(href));
                }
              };

              return (
                <li key={href} className="flex">
                  <Link
                    href={href}
                    prefetch={allowPrefetch ? prefetch : false}
                    onPointerDown={(event) => {
                      if (
                        !isAtDestination
                        && isPlainPrimaryNavigation(event.nativeEvent)
                      ) {
                        setPendingIdx(idx);
                      }
                    }}
                    onPointerCancel={() => setPendingIdx(null)}
                    onPointerLeave={(event) => {
                      // Pointer cancellation is not guaranteed for a mouse
                      // drag that leaves the link. Clear the optimistic mark
                      // without affecting an ordinary post-click hover exit.
                      if (event.buttons !== 0) setPendingIdx(null);
                    }}
                    onClick={handleActivate}
                    aria-current={isAtDestination ? "page" : undefined}
                    className={`${styles.destination} relative flex ${onMap ? "h-[48px] max-h-[48px]" : "h-12"} w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] text-center transition-[color,transform,background-color] duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)]`}
                    data-selected={active ? "true" : "false"}
                  >
                    <span
                      aria-hidden
                      className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2"
                      style={{ background: active ? "var(--app-on-brand)" : "transparent", opacity: 0.5 }}
                    />
                    <Icon
                      width={20}
                      height={20}
                      strokeWidth={active ? 2.25 : 2}
                      fill={active && fillOnActive ? "currentColor" : "none"}
                      aria-hidden
                    />
                    <span className={`${onMap ? "text-[clamp(10px,0.6875rem,12px)]" : "text-[11px]"} font-medium leading-tight tracking-tight`}>
                      {label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
