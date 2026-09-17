import "server-only";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";

import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";
import FairDayWorkspace from "./FairDayWorkspace";

import type { ReactNode } from "react";

/**
 * Server adapter for the canonical reviewed pack. It emits useful schedule,
 * offer, arrival, and source content before the client workspace hydrates.
 */
export default function FairDayPage({ asOf = new Date() }: { asOf?: Date }) {
  const data = buildFairDayWorkspaceData(
    greatFrederickFair2026Pack,
    greatFrederickFair2026PackPointer,
    asOf,
  );
  
  const serverHeroBackground = (
    <>
      <picture className="absolute inset-0 block">
        <source
          type="image/webp"
          srcSet="/images/fair/fairgrounds-night-mike-d-480.webp 480w, /images/fair/fairgrounds-night-mike-d-960.webp 960w, /images/fair/fairgrounds-night-mike-d-1920.webp 1920w"
          sizes="100vw"
        />
        <img
          src="/images/fair/fairgrounds-night-mike-d-960.jpg"
          srcSet="/images/fair/fairgrounds-night-mike-d-960.jpg 960w, /images/fair/fairgrounds-night-mike-d-1920.jpg 1920w"
          sizes="100vw"
          alt="Mike D's photograph of The Great Frederick Fair in 2024, with the illuminated Ferris wheel and midway seen from above."
          width="960"
          height="540"
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-cover object-[76%_center] sm:object-center"
        />
      </picture>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--app-ink) 48%, transparent), transparent 24%), linear-gradient(to top, color-mix(in srgb, var(--app-ink) 96%, transparent), color-mix(in srgb, var(--app-ink) 54%, transparent) 36%, transparent 72%)",
        }}
        aria-hidden
      />
      <span
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 lg:hidden"
        style={{
          background:
            "linear-gradient(90deg, var(--app-brand) 0 24%, var(--app-amber) 24% 41%, var(--app-brand-2) 41% 59%, var(--app-cool) 59% 78%, var(--app-accent) 78% 100%)",
        }}
        aria-hidden
      />
    </>
  );

  return <FairDayWorkspace data={data} serverHeroBackground={serverHeroBackground} />;
}
