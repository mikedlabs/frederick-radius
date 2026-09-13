"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import TodayScopeStatus from "@/components/today/TodayScopeStatus";
import { getScope, subscribeScopeChange, scopeLabel } from "@/lib/scope";

type TodayMastheadProps = {
  /** The server-computed frame title (e.g. "This morning in Frederick County") */
  title: string;
  dateline: string;
};

export default function TodayMasthead({ title, dateline }: TodayMastheadProps) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  
  const displayTitle = (scope && scope.startsWith("town:")) 
    ? title.replace("Frederick County", scopeLabel(scope)) 
    : title;

  return (
    <header className="today-arrival today-arrival--masthead mb-5 flex flex-col overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-bg-elevated-solid)] sm:grid sm:grid-cols-[minmax(0,1fr)_42%]">
      <div className="min-w-0 p-4 sm:p-6 z-10 bg-[var(--app-bg-elevated-solid)]">
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight sm:text-[32px]" style={{ color: "var(--app-ink)" }}>
          {displayTitle}
        </h1>
        <TodayScopeStatus dateline={dateline} />
      </div>
      <figure className="relative order-first h-[140px] sm:order-none sm:h-full sm:min-h-[180px]">
        {/* We fallback to Carroll Creek as requested since we don't have dedicated town imagery yet */}
        <Image 
          src="/images/seasons/summer/SUMMER CARROL CREEK.jpg" 
          fill 
          priority
          sizes="(min-width: 1024px) 440px, 100vw" 
          alt="Carroll Creek in Frederick, photographed by Mike D." 
          className="object-cover object-center" 
        />
        <figcaption className="absolute bottom-2 right-2 rounded-sm bg-[var(--app-ink)] px-2 py-1 text-[10px] leading-snug text-[var(--app-on-brand)] z-10">
          Carroll Creek · Mike D
        </figcaption>
      </figure>
    </header>
  );
}
