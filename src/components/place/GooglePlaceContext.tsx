"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type {
  GooglePlaceFeature,
  GooglePlaceSummary,
} from "@/lib/integrations/google-places";
import { GoogleReviewAttribution } from "@/components/place/GoogleAttribution";
import {
  rememberLivePlaceHours,
  type LivePlaceHoursData,
} from "@/components/place/livePlaceHours";

export type LiveGooglePlaceData = LivePlaceHoursData & {
  editorial_summary?: string;
  generative_summary?: GooglePlaceSummary;
  decision_features?: GooglePlaceFeature[];
  google_maps_uri?: string;
  review_snippet?: string;
  review_author?: string;
  review_author_uri?: string;
  review_author_photo_uri?: string;
  review_google_maps_uri?: string;
  review_flag_content_uri?: string;
};

const IN_FLIGHT = new Map<string, Promise<LiveGooglePlaceData>>();

/** Request coalescing only. The settled response is deliberately not cached. */
export function loadLiveGooglePlaceContext(slug: string): Promise<LiveGooglePlaceData> {
  const key = slug;
  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;
  const pending = fetch(`/api/place/${encodeURIComponent(slug)}/enrich?mode=experience`, {
    cache: "no-store",
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Google context request failed: ${response.status}`);
      return response.json() as Promise<LiveGooglePlaceData>;
    })
    .then((value) => {
      rememberLivePlaceHours(slug, value);
      return value;
    })
    .finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, pending);
  return pending;
}

export function hasLiveGooglePlaceContext(data: LiveGooglePlaceData | null): boolean {
  return Boolean(
    data?.generative_summary ||
    data?.editorial_summary?.trim() ||
    data?.decision_features?.length ||
    data?.review_snippet?.trim(),
  );
}

const FEATURE_LABELS: Record<GooglePlaceFeature, string> = {
  allows_dogs: "Dogs allowed",
  curbside_pickup: "Curbside pickup",
  delivery: "Delivery",
  dine_in: "Dine-in",
  good_for_children: "Good for kids",
  good_for_groups: "Good for groups",
  good_for_watching_sports: "Watch sports",
  live_music: "Live music",
  outdoor_seating: "Outdoor seating",
  reservable: "Reservations",
  restroom: "Restroom",
  serves_breakfast: "Breakfast",
  serves_brunch: "Brunch",
  serves_coffee: "Coffee",
  serves_vegetarian_food: "Vegetarian options",
  takeout: "Takeout",
};

function safeGoogleUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)google\.com$/.test(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compact, attributed Google context. It is visually separated from Radius
 * copy so users can tell exactly which facts came from Google Maps.
 */
export function GooglePlaceContextCard({
  data,
  showSummary = true,
}: {
  data: LiveGooglePlaceData | null;
  showSummary?: boolean;
}) {
  if (!data) return null;
  const summary = showSummary ? data.generative_summary : undefined;
  const editorial = showSummary && !summary
    ? data.editorial_summary?.trim()
    : undefined;
  const features = data.decision_features ?? [];
  const review = data.review_snippet?.trim();
  if (!summary && !editorial && features.length === 0 && !review) return null;

  const mapsUrl = safeGoogleUrl(data.google_maps_uri);
  const reportUrl = safeGoogleUrl(summary?.report_uri);

  return (
    <section
      aria-labelledby="google-place-context-heading"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id="google-place-context-heading"
          className="text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Current place details
        </h3>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-normal tracking-normal"
            style={{ color: "#5e5e5e" }}
          >
            <span translate="no" className="whitespace-nowrap">Google Maps</span>
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : (
          <span translate="no" className="shrink-0 whitespace-nowrap text-xs font-normal" style={{ color: "#5e5e5e" }}>
            Google Maps
          </span>
        )}
      </div>

      {summary ? (
        <div className="mt-2.5">
          <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {summary.text}
          </p>
          <p className="mt-1 text-xs" style={{ color: "#5e5e5e" }}>
            {summary.disclosure}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a
              href="https://support.google.com/local-listings/answer/9851099"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: "#5e5e5e" }}
            >
              About this summary
            </a>
            {reportUrl && (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: "#5e5e5e" }}
              >
                Report summary
              </a>
            )}
          </div>
        </div>
      ) : editorial ? (
        <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {editorial}
        </p>
      ) : null}

      {features.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Place features from Google Maps">
          {features.map((feature) => (
            <li
              key={feature}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              {FEATURE_LABELS[feature]}
            </li>
          ))}
        </ul>
      )}

      {review && (
        <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--app-ink-2)" }}>
            Read one Google Maps review
          </summary>
          <figure className="mt-2">
            <blockquote className="text-sm italic leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              &ldquo;{review}&rdquo;
            </blockquote>
            <GoogleReviewAttribution
              author={data.review_author}
              authorUri={data.review_author_uri}
              authorPhotoUri={data.review_author_photo_uri}
              reviewGoogleMapsUri={data.review_google_maps_uri}
              reviewFlagContentUri={data.review_flag_content_uri}
              placeGoogleMapsUri={data.google_maps_uri}
            />
          </figure>
        </details>
      )}
    </section>
  );
}

export default function LiveGooglePlaceContext({
  slug,
  showSummary = true,
}: {
  slug: string;
  showSummary?: boolean;
}) {
  const [data, setData] = useState<LiveGooglePlaceData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  if (hasLiveGooglePlaceContext(data)) {
    return <GooglePlaceContextCard data={data} showSummary={showSummary} />;
  }

  return (
    <div>
      <button
        type="button"
        disabled={status === "loading"}
        onClick={() => {
          setStatus("loading");
          loadLiveGooglePlaceContext(slug)
            .then((value) => {
              setData((current) => ({ ...current, ...value }));
              setStatus("idle");
            })
            .catch(() => setStatus("error"));
        }}
        className="tap-44-y inline-flex items-center gap-1.5 text-sm font-semibold disabled:opacity-60"
        style={{ color: "var(--app-brand-press)" }}
      >
        {status === "loading" ? "Checking current details…" : "Check current Google details"}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </button>
      {status === "error" ? (
        <p className="mt-1 text-xs" role="status" style={{ color: "var(--app-ink-3)" }}>
          Current Google details are unavailable right now.
        </p>
      ) : null}
    </div>
  );
}
