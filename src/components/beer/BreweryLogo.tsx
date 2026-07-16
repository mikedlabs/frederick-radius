"use client";

import Image from "next/image";
import { useState } from "react";
import { BREWERY_EXPERIENCE_BY_SLUG } from "@/data/brewery-experiences";

type BreweryLogoProps = {
  brewerySlug: string;
  breweryName: string;
  decorative?: boolean;
  className?: string;
  sizes?: string;
};

function breweryInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "FR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * A local brewery mark with a text fallback for incomplete or failed assets.
 * Use `decorative` when the surrounding control already names the brewery.
 */
export function BreweryLogo({
  brewerySlug,
  breweryName,
  decorative = false,
  className = "",
  sizes = "64px",
}: BreweryLogoProps) {
  const logoSrc = BREWERY_EXPERIENCE_BY_SLUG[brewerySlug]?.logoSrc;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = !logoSrc || failedSrc === logoSrc;
  const accessibleLabel = `${breweryName} logo`;

  if (showFallback) {
    return (
      <span
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : accessibleLabel}
        role={decorative ? undefined : "img"}
        className={`inline-flex items-center justify-center overflow-hidden font-mono text-[11px] font-bold tracking-[-0.03em] ${className}`}
        style={{
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-2)",
        }}
      >
        {breweryInitials(breweryName)}
      </span>
    );
  }

  return (
    <span
      aria-hidden={decorative || undefined}
      className={`relative inline-block overflow-hidden ${className}`}
    >
      <Image
        src={logoSrc}
        alt={decorative ? "" : accessibleLabel}
        fill
        sizes={sizes}
        className="object-contain"
        onError={() => setFailedSrc(logoSrc)}
      />
    </span>
  );
}
