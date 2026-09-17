"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin, Search, Route, Building2 } from "lucide-react";
import { requestFind } from "@/lib/findBridge";
import { haptic } from "@/lib/haptics";
import BrowsePlacesDisclosure from "./BrowsePlacesDisclosure";
import { useSyncExternalStore, type ReactNode } from "react";
import { getScope, scopeToParam, subscribeScopeChange } from "@/lib/scope";
import { MagicCard } from "@/components/ui/MagicCard";

/**
 * Today has one doorway for a named place, a category, or a full question.
 * The global Find surface decides whether the request belongs in deterministic
 * search or the reasoning workspace. People never have to choose the tool.
 *
 * Two urgent shortcuts stay visible. The full category index is available in
 * the attached disclosure, but it no longer occupies the page by default.
 */
export default function TodayAsk({
  children,
  embedded = false,
}: {
  children?: ReactNode;
  embedded?: boolean;
}) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  const planHref = `/ask?q=${encodeURIComponent("Plan the next two hours")}${scope ? `&in=${scopeToParam(scope)}` : ""}`;
  return (
    <MagicCard
      as="section"
      id="find-radius"
      aria-labelledby="today-find-heading"
      data-surface-row={embedded ? "find" : undefined}
      className={`${embedded ? "" : "mt-3"} scroll-mt-24 ${embedded ? "border-transparent bg-transparent" : ""}`}
    >
      <h2 id="today-find-heading" className="sr-only">
        Find what you need
      </h2>

      <Link
        href="/search"
        prefetch={false}
        onClick={(event) => {
          if (
            event.button !== 0
            || event.altKey
            || event.ctrlKey
            || event.metaKey
            || event.shiftKey
          ) return;
          event.preventDefault();
          haptic("light");
          requestFind("global");
        }}
        aria-label="Find a place, service, event, or answer"
        className="group flex min-h-[96px] w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.995]"
      >
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            What do you need?
          </span>
          <span className="mt-1.5 block max-w-[34ch] text-[14px] leading-normal" style={{ color: "var(--app-ink-2)" }}>
            Find a place or service, or ask for help planning your time.
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
          style={{ color: "var(--app-brand-press)" }}
          aria-hidden
        />
      </Link>

      <div
        className="grid grid-cols-2 border-t"
        style={{ borderColor: "var(--app-border)" }}
        aria-label="Quick needs"
      >
        <Link
          href="/open-now"
          prefetch={false}
          className="group flex min-h-12 items-center gap-2.5 px-4 py-3 transition hover:bg-[var(--app-bg-sunken)]"
        >
          <Clock3 className="h-4 w-4 shrink-0" strokeWidth={2.15} style={{ color: "var(--app-brand-press)" }} aria-hidden />
          <span className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Open now
          </span>
        </Link>
        <Link
          href="/amenities"
          prefetch={false}
          className="group flex min-h-12 items-center gap-2.5 border-l px-4 py-3 transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.15} style={{ color: "var(--app-brand-press)" }} aria-hidden />
          <span className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Public essentials
          </span>
        </Link>
        <Link href={planHref} prefetch={false} className="flex min-h-12 items-center gap-2.5 border-t px-4 py-3 text-[14px] font-semibold hover:bg-[var(--app-bg-sunken)]" style={{ borderColor: "var(--app-border)" }}>
          <Route className="h-4 w-4 shrink-0" aria-hidden style={{ color: "var(--app-brand-press)" }} />
          Plan a few hours
        </Link>
        <Link href="/contacts" prefetch={false} className="flex min-h-12 items-center gap-2.5 border-l border-t px-4 py-3 text-[14px] font-semibold hover:bg-[var(--app-bg-sunken)]" style={{ borderColor: "var(--app-border)" }}>
          <Building2 className="h-4 w-4 shrink-0" aria-hidden style={{ color: "var(--app-cool)" }} />
          Local services
        </Link>
      </div>

      {children ? (
        <BrowsePlacesDisclosure embedded>{children}</BrowsePlacesDisclosure>
      ) : null}
    </MagicCard>
  );
}
