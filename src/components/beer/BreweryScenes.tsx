import Image from "next/image";
import Link from "next/link";
import { Camera, MapPinned } from "lucide-react";
import { BREWERIES, BREWERY_BY_SLUG } from "@/data/beers";
import {
  BREWERY_EXPERIENCES,
  type BreweryScene,
} from "@/data/brewery-experiences";
import { BreweryLogo } from "./BreweryLogo";

type SceneVisual = {
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
    eyebrow: "Creek corridor",
    title: "Carroll Creek",
    description:
      "A compact cluster shaped by patios, reused industrial spaces, and the creek itself.",
    photo: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    objectPosition: "50% 48%",
  },
  "city-taprooms": {
    eyebrow: "In the city",
    title: "Neighborhood taprooms",
    description:
      "Historic rooms, production spaces, and independent taprooms spread through Frederick.",
    photo: "/images/seasons/winter/WINTER 3.jpg",
    objectPosition: "50% 50%",
  },
  "farm-country": {
    eyebrow: "Beyond downtown",
    title: "Farm country",
    description:
      "Make the landscape part of the stop, from old barns to open air and mountain views.",
    photo: "/images/seasons/summer/SUMMER MUST USE.jpg",
    objectPosition: "50% 36%",
  },
  "destination-stops": {
    eyebrow: "Across the county",
    title: "Worth the detour",
    description:
      "Small-town and edge-of-city stops for days when the setting matters as much as the pour.",
    photo: "/images/seasons/fall/056.jpg",
    objectPosition: "50% 64%",
  },
};

/** A visual, setting-first way into the brewery guide. */
export function BreweryScenes() {
  return (
    <section id="beer-settings" aria-labelledby="beer-settings-heading" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[42rem]">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Pick the feeling first
          </p>
          <h2
            id="beer-settings-heading"
            className="font-serif text-[clamp(1.75rem,4vw,2.4rem)] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Beer has a sense of place here.
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Start with the kind of place you want to be. Open a brewery guide for the practical details.
          </p>
        </div>
        <span
          className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.09em]"
          style={{
            borderColor: "var(--app-border-strong)",
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink-3)",
          }}
        >
          <MapPinned className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {BREWERIES.length} guides · {SCENE_ORDER.length} settings
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {SCENE_ORDER.map((scene) => {
          const visual = SCENE_VISUALS[scene];
          const experiences = BREWERY_EXPERIENCES.filter(
            (experience) => experience.scene === scene,
          );
          const statusNotes = experiences.filter((experience) => experience.statusNote);

          return (
            <article
              key={scene}
              className="group relative isolate min-h-[390px] overflow-hidden rounded-[var(--app-radius-xl)] border p-4 sm:min-h-[420px] sm:p-5"
              style={{
                borderColor: "color-mix(in srgb, var(--app-accent) 32%, var(--app-border))",
                background: "var(--app-brand-2)",
                boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
              }}
            >
              <Image
                src={visual.photo}
                alt=""
                fill
                sizes="(min-width: 1024px) 560px, calc(100vw - 32px)"
                className="-z-20 object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.015]"
                style={{ objectPosition: visual.objectPosition }}
              />
              <div
                aria-hidden
                className="absolute inset-0 -z-10"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(5, 17, 14, 0.52) 0%, rgba(5, 17, 14, 0.70) 45%, rgba(5, 17, 14, 0.97) 100%)",
                }}
              />

              <div className="flex min-h-[356px] flex-col sm:min-h-[380px]">
                <div className="max-w-[32rem]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-white/70">
                      {visual.eyebrow}
                    </p>
                    <span className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white/75 backdrop-blur-sm">
                      {experiences.length} {experiences.length === 1 ? "guide" : "guides"}
                    </span>
                  </div>
                  <h3 className="mt-2 font-serif text-[30px] font-semibold leading-none tracking-tight text-white">
                    {visual.title}
                  </h3>
                  <p className="mt-2 max-w-[29rem] text-[13px] leading-relaxed text-white/80">
                    {visual.description}
                  </p>
                </div>

                <ul
                  className="mt-auto grid grid-cols-3 gap-2 pt-8 sm:grid-cols-6"
                  aria-label={`${visual.title} brewery guides`}
                >
                  {experiences.map((experience) => {
                    const brewery = BREWERY_BY_SLUG[experience.slug];
                    if (!brewery) return null;

                    return (
                      <li key={experience.slug} className="min-w-0 text-center">
                        <Link
                          href={`/places/${experience.slug}`}
                          aria-label={`Open the ${brewery.name} guide`}
                          className="group block rounded-[var(--app-radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-brand-2)]"
                        >
                          <BreweryLogo
                            brewerySlug={experience.slug}
                            breweryName={brewery.name}
                            decorative
                            sizes="52px"
                            className="mx-auto h-[52px] w-[52px] rounded-full border border-white/50 bg-white p-1 shadow-[0_8px_20px_rgba(0,0,0,0.32)] transition-transform group-hover:-translate-y-0.5"
                          />
                          <span className="mt-1.5 line-clamp-2 text-[9px] font-semibold leading-tight text-white/85 group-hover:text-white group-hover:underline">
                            {brewery.name}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {statusNotes.length > 0 ? (
                  <p className="mt-3 rounded-[var(--app-radius-sm)] border border-amber-200/20 bg-black/25 px-2.5 py-2 text-[10px] leading-relaxed text-amber-50/85 backdrop-blur-sm">
                    Check current access before visiting {statusNotes.map((item) => BREWERY_BY_SLUG[item.slug]?.name).filter(Boolean).join(", ")}.
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <p className="flex items-start gap-2 px-1 text-[10px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden />
        <span>
          Frederick Radius aerial photography sets the scene; it does not depict every brewery shown. Brewery access and status can change, so verify before visiting.
        </span>
      </p>
    </section>
  );
}
