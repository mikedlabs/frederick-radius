"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Camera, MapPin } from "lucide-react";
import { BREWERIES, BREWERY_BY_SLUG } from "@/data/beers";
import {
  BREWERY_EXPERIENCES,
  type BreweryScene,
} from "@/data/brewery-experiences";
import { BreweryLogo } from "./BreweryLogo";

type SceneVisual = {
  navLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  photo: string;
  objectPosition: string;
};

const SCENE_ORDER: BreweryScene[] = [
  "carroll-creek",
  "city-taprooms",
  "farm-country",
  "destination-stops",
];

const SCENE_VISUALS: Record<BreweryScene, SceneVisual> = {
  "carroll-creek": {
    navLabel: "By the creek",
    eyebrow: "Walkable + waterside",
    title: "Carroll Creek",
    description: "Patios, reused industrial rooms, and three distinct breweries close enough to feel like one neighborhood.",
    photo: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    objectPosition: "50% 48%",
  },
  "city-taprooms": {
    navLabel: "In the city",
    eyebrow: "Historic rooms + small batches",
    title: "City taprooms",
    description: "Downtown anchors, production spaces, and small-batch rooms scattered through Frederick.",
    photo: "/images/seasons/winter/WINTER 3.jpg",
    objectPosition: "50% 50%",
  },
  "farm-country": {
    navLabel: "Out on the farm",
    eyebrow: "Barns + open air",
    title: "Farm country",
    description: "Make the landscape part of the stop, from working farms and hop yards to mountain views.",
    photo: "/images/seasons/summer/SUMMER MUST USE.jpg",
    objectPosition: "50% 36%",
  },
  "destination-stops": {
    navLabel: "Worth the drive",
    eyebrow: "Small towns + detours",
    title: "County detours",
    description: "A few places to build a longer county outing around when the setting matters as much as the pour.",
    photo: "/images/seasons/fall/056.jpg",
    objectPosition: "50% 64%",
  },
};

/** One cinematic setting at a time, instead of a four-card directory wall. */
export function BreweryScenes() {
  const [scene, setScene] = useState<BreweryScene>("carroll-creek");
  const visual = SCENE_VISUALS[scene];
  const experiences = BREWERY_EXPERIENCES.filter((item) => item.scene === scene);
  const statusNotes = experiences.filter((item) => item.statusNote);

  return (
    <section id="beer-settings" aria-labelledby="beer-settings-heading" className="scroll-mt-24 space-y-6">
      <header className="grid gap-5 border-t pt-6 sm:grid-cols-[1fr_auto] sm:items-end" style={{ borderColor: "var(--app-border-strong)" }}>
        <div className="max-w-[46rem]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.17em]" style={{ color: "var(--app-ink-3)" }}>
            Choose the atmosphere
          </p>
          <h2 id="beer-settings-heading" className="mt-2 max-w-[13ch] font-serif text-[clamp(2.4rem,6vw,4.6rem)] font-semibold leading-[0.94] tracking-[-0.045em]" style={{ color: "var(--beer-ink)" }}>
            The room changes the beer.
          </h2>
          <p className="mt-4 max-w-[38rem] text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Pick the kind of place you want to spend time in. We&rsquo;ll narrow the county before you ever see a list.
          </p>
        </div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          {BREWERIES.length} guides · 4 settings
        </p>
      </header>

      <div role="group" aria-label="Choose a brewery setting" className="grid border-y sm:grid-cols-4" style={{ borderColor: "var(--app-border-strong)" }}>
        {SCENE_ORDER.map((key, index) => {
          const selected = key === scene;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => setScene(key)}
              className="group flex min-h-16 items-center gap-3 border-b px-3 py-3 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)] sm:border-b-0 sm:border-r sm:last:border-r-0"
              style={{
                borderColor: "var(--app-border)",
                background: selected ? "var(--beer-ink)" : "transparent",
                color: selected ? "#f7f0e4" : "var(--app-ink-2)",
              }}
            >
              <span className="font-mono text-[10px] tabular-nums opacity-45">0{index + 1}</span>
              <span className="text-[13px] font-semibold">{SCENE_VISUALS[key].navLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[28px] bg-[var(--beer-ink)] text-white shadow-[0_24px_64px_rgba(20,28,23,0.20)] lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(310px,0.55fr)]">
        <div className="relative min-h-[420px] overflow-hidden lg:min-h-[560px]">
          <Image
            key={visual.photo}
            src={visual.photo}
            alt=""
            fill
            sizes="(min-width: 1024px) 680px, calc(100vw - 32px)"
            className="object-cover motion-safe:animate-[fade-in_500ms_ease-out]"
            style={{ objectPosition: visual.objectPosition }}
          />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,15,12,0.08)_0%,rgba(9,15,12,0.16)_50%,rgba(9,15,12,0.78)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{visual.eyebrow}</p>
            <h3 className="mt-2 font-serif text-[clamp(2.7rem,7vw,5.4rem)] font-semibold leading-[0.88] tracking-[-0.05em] text-[#f7f0e4]">{visual.title}</h3>
            <p className="mt-4 max-w-[38rem] text-[13px] leading-relaxed text-white/72 sm:text-[15px]">{visual.description}</p>
          </div>
        </div>

        <div className="flex flex-col border-t border-white/12 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
          <div className="flex items-center justify-between gap-3 border-b border-white/12 pb-4">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">Inside this setting</p>
            <span className="text-[11px] text-white/45">{experiences.length} guides</span>
          </div>

          <ul className="divide-y divide-white/10" aria-label={`${visual.title} brewery guides`}>
            {experiences.map((experience) => {
              const brewery = BREWERY_BY_SLUG[experience.slug];
              if (!brewery) return null;
              return (
                <li key={experience.slug}>
                  <Link
                    href={`/places/${experience.slug}`}
                    className="group grid min-h-[76px] grid-cols-[44px_1fr_auto] items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--beer-copper-light)]"
                  >
                    <BreweryLogo brewerySlug={experience.slug} breweryName={brewery.name} decorative sizes="44px" className="h-11 w-11 rounded-[10px] bg-white object-contain p-1.5" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-white">{brewery.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-white/42">{experience.traits.slice(0, 2).join(" · ")}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-[var(--beer-copper-light)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>

          {statusNotes.length > 0 ? (
            <p className="mt-auto border-t border-white/12 pt-4 text-[10px] leading-relaxed text-amber-100/65">
              Confirm current access before visiting {statusNotes.map((item) => BREWERY_BY_SLUG[item.slug]?.name).filter(Boolean).join(", ")}.
            </p>
          ) : null}
        </div>
      </div>

      <p className="flex items-start gap-2 text-[10px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
        <span>Frederick Radius aerial photography sets the mood; it does not depict every brewery shown. <MapPin className="mb-0.5 ml-1 inline h-3 w-3" aria-hidden /> Verify current access before visiting.</span>
      </p>
    </section>
  );
}
