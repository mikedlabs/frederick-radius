"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { cancelPrimaryTabResume, preparePrimaryTabResume, rememberPrimaryTab } from "@/lib/primary-tab-session";
import { TABS, shouldPrefetchGlobalNavigation, tabIndexForPath } from "./tabs";
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname completion clears the optimistic destination
    setPendingIdx(null);
  }, [pathname]);

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
        data-map-bottom-nav={pathname === "/map" ? "true" : undefined}
        className={`${styles.dockShell} fixed inset-x-0 bottom-0 lg:hidden`}
        style={{
          zIndex: "var(--z-nav)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <nav
          aria-label="Primary"
          aria-busy={pendingIdx !== null}
          className={`${styles.dock} relative mx-auto max-w-screen-md`}
        >
          <ul className="mx-auto grid max-w-screen-md grid-cols-4">
            {TABS.map(({ href, label, icon: Icon, prefetch, fillOnActive }, idx) => {
              const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
              const isRealActive = realIdx === idx;
              // A requested destination is pending until its pathname commits.
              const active = isRealActive;

              const handleActivate = (event: React.MouseEvent<HTMLAnchorElement>) => {
                if (event.defaultPrevented || !isPlainPrimaryNavigation(event.nativeEvent)) {
                  setPendingIdx(null);
                  return;
                }
                rememberPrimaryTab(`${window.location.pathname}${window.location.search}${window.location.hash}`, window.scrollY);
                // Reselecting this root keeps the current filters and position.
                // A nested route can still return to its remembered root.
                if (pathname === href) {
                  event.preventDefault();
                  cancelPrimaryTabResume();
                  setPendingIdx(null);
                  return;
                }
                const resume = preparePrimaryTabResume(href);
                const destination = resume?.href ?? href;
                const navigate = () => resume ? router.push(destination, { scroll: false }) : router.push(destination);
                setPendingIdx(idx);
                haptic("light");
                if (typeof document !== "undefined" && "startViewTransition" in document) {
                  event.preventDefault();
                  const doc = document as Document & {
                    startViewTransition?: (callback: () => void) => unknown;
                  };
                  doc.startViewTransition?.(navigate);
                } else if (resume) {
                  event.preventDefault();
                  navigate();
                }
              };

              return (
                <li key={href} className="flex">
                  <Link
                    href={href}
                    prefetch={allowPrefetch && pathname !== href ? prefetch : false}
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
                    data-press-target="tab"
                    data-pending={pendingIdx === idx ? "true" : "false"}
                    className={`${styles.destination} relative flex h-14 w-full flex-col items-center justify-center gap-1 text-center transition-colors duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)]`}
                    data-selected={active ? "true" : "false"}
                  >
                    {/* Plain tool: the selected destination is marked by a
                        2px coral rule across the top of its column, a 700
                        label and a heavier icon stroke. */}
                    <span aria-hidden data-destination-rule className={styles.destinationRule} />
                    <span data-press-face className="flex flex-col items-center justify-center gap-1">
                      <Icon
                        width={20}
                        height={20}
                        strokeWidth={active ? 2.5 : 1.75}
                        fill={active && fillOnActive ? "currentColor" : "none"}
                        aria-hidden
                      />
                      <span className={`${styles.destinationLabel} text-[11px] leading-tight`}>
                        {label}
                      </span>
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
