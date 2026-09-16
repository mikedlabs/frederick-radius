import React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import InTheStreetsTimelineCard from "./InTheStreetsTimelineCard";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

export default function InTheStreetsWorkspace() {
  return (
    <div className="relative mx-auto max-w-screen-sm space-y-6 pb-20">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs px-2 pt-2">
        <Link href="/today" className="inline-flex items-center gap-1.5 px-2 py-3.5 -mx-2 -my-3.5 hover:underline text-[var(--app-ink-3)] transition-colors active:text-[var(--app-brand)]">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Today
        </Link>
      </nav>

      {/* Hero Header */}
      <header className="relative px-2">
        <p className="relative inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--app-brand)] mb-1">
          <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          This Saturday
        </p>
        <h1 className="relative font-serif font-semibold leading-[1.02] tracking-tight text-[var(--app-ink)] text-4xl mb-3">
          In The Streets
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--app-ink-2)] max-w-[40ch]">
          Downtown&apos;s biggest block party is back. Market Street is closed to traffic and filled with stages, food, and 75,000 of your neighbors.
        </p>
      </header>

      {/* Interactive Timeline Stack */}
      <div className="px-2 space-y-4">
        <InTheStreetsTimelineCard
          title="Market Street Mile"
          time="9:00 AM"
          location="Market Street"
          description="The morning road race that kicks the day off before the festival officially opens."
          imageUrl="/images/color-frederick-cover.webp" 
          imageAlt="Runners on Market Street"
        />

        <InTheStreetsTimelineCard
          title="Festival Opens"
          time="11:00 AM - 5:00 PM"
          location="Downtown Frederick"
          description="Several entertainment stages, food from Frederick restaurants, and vendors down the length of the street."
          imageUrl="/images/color-frederick-cover.webp"
          imageAlt="Crowds at In The Streets"
        />

        <InTheStreetsTimelineCard
          title="Craft Beverage Experience"
          time="12:00 PM - 5:00 PM"
          location="Carroll Creek"
          description="Local breweries, distilleries, and wineries pour in a midday tasting garden."
          imageUrl="/images/color-frederick-cover.webp"
          imageAlt="Craft Beverage Tasting"
        />

        <InTheStreetsTimelineCard
          title="Up The Creek After-Party"
          time="5:00 PM - 9:00 PM"
          location="Carroll Creek Urban Park"
          description="The evening party along the creek that closes out the day with live music."
          imageUrl="/images/color-frederick-cover.webp"
          imageAlt="Up The Creek Party"
        />
      </div>

      {/* Logistics inside Collapsible Sections so they don't clutter the fun */}
      <div className="px-2 mt-8">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-ink-3)] mb-2 px-1">
          Getting There & Logistics
        </h2>
        <div className="bg-[var(--app-bg-elevated)] border border-[var(--app-border)] rounded-[var(--app-radius-lg)] overflow-hidden">
          <CollapsibleSection title="Road Closures & Parking" storageKey="its-logistics">
            <div className="text-[14px] text-[var(--app-ink-2)] leading-relaxed pb-4">
              <p className="mb-2">
                <strong>Market Street is closed</strong> to traffic for the entire day.
              </p>
              <p>
                Park in any of the city decks (Church St, Carroll Creek, Court St, West Patrick) and walk in. Decks fill up quickly by noon.
              </p>
            </div>
          </CollapsibleSection>
          <div className="h-[1px] w-full bg-[var(--app-border)]" />
          <CollapsibleSection title="Is the festival free?" storageKey="its-free">
            <div className="text-[14px] text-[var(--app-ink-2)] leading-relaxed pb-4">
              Yes! The street festival is entirely free to walk. The Craft Beverage tasting garden and the Market Street Mile run are the only ticketed add-ons.
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
