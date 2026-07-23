"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { requestFind } from "@/lib/findBridge";
import { TABS, tabIndexForPath } from "./tabs";
import { useHideOnScroll } from "./useHideOnScroll";

/**
 * Mobile primary navigation as a compact field-guide index strip.
 *
 * The destinations remain conventional, but the floating glass capsule,
 * glowing center orb, and animated selection pill have been retired. A brick
 * registration rule now marks the active chapter. Find remains prominent
 * because it is the highest-frequency action, not because it glows.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useHideOnScroll(false);
  const realIdx = tabIndexForPath(pathname);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const findRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname completion clears the optimistic destination
    setPendingIdx(null);
  }, [pathname]);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setFindOpen(Boolean(detail?.open));
    };
    window.addEventListener("fr:search-state", sync);
    return () => window.removeEventListener("fr:search-state", sync);
  }, []);

  useEffect(() => {
    findRef.current?.setAttribute("data-find-ready", "true");
  }, []);

  if (pathname.startsWith("/ask")) return null;

  const mapOwnsFind = pathname === "/map";
  const findEmphasized = !mapOwnsFind || findOpen;
  const findCell = (
    <li key="find" className="flex px-0.5">
      <Link
        ref={findRef}
        href={mapOwnsFind ? "/map#map-search-input" : "/search"}
        aria-label={mapOwnsFind ? "Find on this map" : "Find across Frederick County"}
        aria-haspopup={mapOwnsFind ? undefined : "dialog"}
        aria-controls={mapOwnsFind ? "map-search-input" : "radius-find-dialog"}
        aria-expanded={mapOwnsFind ? undefined : findOpen}
        onClick={(event) => {
          event.preventDefault();
          haptic("light");
          requestFind(mapOwnsFind ? "map" : "global");
        }}
        className="relative flex h-12 w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[var(--app-radius-sm)] transition-transform duration-[var(--app-dur-med)] ease-[var(--app-ease-spring)] active:scale-[0.92] active:duration-150 active:ease-[var(--app-ease-out)]"
        style={{
          background: findOpen
            ? "var(--app-brand)"
            : findEmphasized
              ? "color-mix(in srgb, var(--app-brand) 11%, var(--app-bg-elevated-solid))"
              : "transparent",
          color: findOpen
            ? "var(--app-on-brand)"
            : findEmphasized
              ? "var(--app-brand-press)"
              : "var(--app-ink-3)",
          border: findEmphasized
            ? "1px solid color-mix(in srgb, var(--app-brand) 28%, var(--app-border))"
            : "1px solid transparent",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-2 top-0 h-[2px]"
          style={{
            background: findOpen
              ? "var(--app-on-brand)"
              : findEmphasized
                ? "var(--app-brand)"
                : "transparent",
          }}
        />
        <Search width={20} height={20} strokeWidth={2.25} aria-hidden />
        <span className="text-[11px] font-semibold leading-tight tracking-tight">Find</span>
      </Link>
    </li>
  );

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 lg:hidden"
      style={{
        zIndex: "var(--z-nav)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right, 0px))",
        transform: hidden
          ? "translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 12px))"
          : "translateY(0)",
        transition: "transform var(--app-dur-med) var(--app-ease-out)",
        willChange: "transform",
      }}
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative mx-auto max-w-screen-md overflow-hidden rounded-[var(--app-radius-lg)]"
        style={{
          background: "var(--app-bg-elevated-solid)",
          border: "1px solid var(--app-border-strong)",
          boxShadow: "var(--app-elev-2)",
        }}
      >
        <ul className="mx-auto grid max-w-screen-md grid-cols-5 px-1 py-1">
          {TABS.map(({ href, label, icon: Icon, fillOnActive }, idx) => {
            const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
            const isRealActive = realIdx === idx;
            const active = isRealActive || pendingIdx === idx;

            const handleActivate = (event: React.MouseEvent<HTMLAnchorElement>) => {
              if (isAtDestination) return;
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

            const cell = (
              <li key={href} className="flex">
                <Link
                  href={href}
                  prefetch={false}
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  onPointerDown={() => {
                    if (!isAtDestination) setPendingIdx(idx);
                  }}
                  onClick={handleActivate}
                  aria-current={isRealActive ? "page" : undefined}
                  className="relative flex h-12 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] text-center transition-transform duration-[var(--app-dur-med)] ease-[var(--app-ease-spring)] active:scale-[0.92] active:duration-150 active:ease-[var(--app-ease-out)]"
                  style={{
                    color: active ? "var(--app-brand-press)" : "var(--app-ink-3)",
                    background: active ? "var(--app-brand-tint-6)" : "transparent",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-2 top-0 h-[2px]"
                    style={{ background: active ? "var(--app-brand)" : "transparent" }}
                  />
                  <Icon
                    width={20}
                    height={20}
                    strokeWidth={active ? 2.25 : 2}
                    fill={active && fillOnActive ? "currentColor" : "none"}
                    aria-hidden
                  />
                  <span className="text-[11px] font-medium leading-tight tracking-tight">
                    {label}
                  </span>
                </Link>
              </li>
            );

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
