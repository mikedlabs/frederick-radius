/**
 * The five popup card components rendered inside Mapbox <Popup>s. Plain
 * inline styles because they render into a Mapbox-owned DOM subtree that
 * sits outside React's CSS scope; class-based styles weren't inheriting
 * predictably.
 *
 * Extracted from AppMap.tsx where they were defined at the bottom of the
 * file. No behavior change: same JSX, same imports, same props.
 */
import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { EventPin, SelectedOsm, SelectedPlace } from "./types";

/** Compact event card shown inside a Mapbox Popup. */
export function EventPopup({ e }: { e: EventPin }) {
  const start = new Date(e.starts_at);
  const now = new Date();
  const msUntil = start.getTime() - now.getTime();
  const within24h = msUntil > -3 * 3_600_000 && msUntil < 24 * 3_600_000;
  const dateStr = within24h
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(start)
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(start);
  const color = e.category_color || "var(--app-brand)";
  return (
    <div style={{ minWidth: 230, padding: 4 }}>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color,
          marginBottom: 4,
        }}
      >
        {dateStr}
      </p>
      <strong
        style={{
          display: "block",
          fontSize: 15,
          lineHeight: 1.25,
          color: "var(--app-ink, #1A1A1A)",
          fontFamily: "var(--font-display), ui-serif, Georgia, serif",
        }}
      >
        {e.title}
      </strong>
      <p style={{ fontSize: 12, margin: "4px 0 8px", color: "var(--app-ink-2, #4A4A48)" }}>
        {e.venue_name}
      </p>
      <Link
        href={`/events/${e.slug}`}
        style={{
          display: "inline-block",
          fontSize: 12,
          fontWeight: 700,
          color,
        }}
      >
        See event →
      </Link>
    </div>
  );
}

export function PlacePopup({ p }: { p: SelectedPlace }) {
  const cat = CATEGORY_BY_SLUG[p.category];
  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "var(--app-brand)", marginBottom: 4,
      }}>
        {cat?.name ?? p.category}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "var(--app-ink, #1A1A1A)", fontFamily: "var(--font-display), ui-serif, Georgia, serif" }}>
        {p.name}
      </strong>
      <p style={{ fontSize: 12, margin: "6px 0", color: "var(--app-ink-2, #4A4A48)", lineHeight: 1.45 }}>
        {p.short_blurb}
      </p>
      <Link
        href={`/places/${p.slug}`}
        style={{ fontSize: 12, fontWeight: 600, color: "var(--app-brand)" }}
      >
        Open page →
      </Link>
    </div>
  );
}

export function OsmPopup({ p }: { p: SelectedOsm }) {
  const cat = CATEGORY_BY_SLUG[p.category_slug];

  // Community reports (the /report crowdsourced layer) — osm_id "report:…".
  // Caution styling + the photo/note + honest "Community report" provenance,
  // not the OSM warning.
  if (p.osm_id?.startsWith("report:")) {
    const REPORT_LABEL: Record<string, { label: string; color: string }> = {
      "report-hazard": { label: "Hazard", color: "#C2410C" },
      "report-condition": { label: "Condition", color: "#2F5470" },
      "report-tip": { label: "Tip", color: "#B07A1E" },
      "report-note": { label: "Local note", color: "#7A7975" },
    };
    const meta = REPORT_LABEL[p.category_slug] ?? { label: "Report", color: "#2F5470" };
    return (
      <div style={{ minWidth: 200, maxWidth: 240, padding: 4 }}>
        {p.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- Mapbox popup is outside next/image's tree
          <img src={p.photo} alt={p.name} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 6, display: "block" }} />
        )}
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: meta.color, marginBottom: 4 }}>
          {meta.label}
        </p>
        <strong style={{ display: "block", fontSize: 15, color: "var(--app-ink, #16140E)", fontFamily: "var(--font-display), ui-serif, Georgia, serif" }}>
          {p.name}
        </strong>
        {p.address && (
          <p style={{ fontSize: 12, margin: "6px 0 4px", color: "var(--app-ink-2, #423E34)", lineHeight: 1.4 }}>
            {p.address}
          </p>
        )}
        <p style={{ marginTop: 6, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.color }}>
          Community report
        </p>
      </div>
    );
  }

  // Field-collected amenities (the /collect tool) are NOT from OpenStreetMap —
  // they're marked on foot by a neighbor. Show the reference photo + note and
  // honest provenance instead of the OSM "unverified / may be stale" warning
  // and the (bogus) OSM link.
  if (p.osm_id?.startsWith("field:")) {
    return (
      <div style={{ minWidth: 200, maxWidth: 240, padding: 4 }}>
        {p.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- Mapbox popup is outside next/image's tree
          <img
            src={p.photo}
            alt={p.name}
            style={{
              width: "100%", height: 120, objectFit: "cover",
              borderRadius: 8, marginBottom: 6, display: "block",
            }}
          />
        )}
        <p style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: cat?.color ?? "var(--app-brand-2, #2F5470)", marginBottom: 4,
        }}>
          {cat?.name ?? p.category_slug}
        </p>
        <strong style={{ display: "block", fontSize: 15, color: "var(--app-ink, #1A1A1A)", fontFamily: "var(--font-display), ui-serif, Georgia, serif" }}>
          {p.name}
        </strong>
        {p.address && (
          <p style={{ fontSize: 12, margin: "6px 0 4px", color: "var(--app-ink-2, #4A4A48)", lineHeight: 1.4 }}>
            {p.address}
          </p>
        )}
        <p style={{
          marginTop: 6, fontSize: 10, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--app-brand-2, #2F5470)",
        }}>
          Marked on foot
        </p>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "var(--app-ink-3, #7A7975)", marginBottom: 4,
      }}>
        {cat?.name ?? p.category_slug}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "var(--app-ink, #1A1A1A)", fontFamily: "var(--font-display), ui-serif, Georgia, serif" }}>
        {p.name}
      </strong>
      <p style={{
        marginTop: 4, fontSize: 10, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--app-warning)",
      }}>
        ⚠ Unverified · from OpenStreetMap · may be closed or stale
      </p>
      {p.cuisine && (
        <p style={{ fontSize: 11, marginTop: 4, color: "var(--app-ink-3, #7A7975)", textTransform: "capitalize" }}>
          {p.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}
        </p>
      )}
      {(p.address || p.city) && (
        <p style={{ fontSize: 12, margin: "6px 0 4px", color: "var(--app-ink-2, #4A4A48)", lineHeight: 1.4 }}>
          {[p.address, p.city].filter(Boolean).join(", ")}
        </p>
      )}
      {p.opening_hours && (
        <p style={{ fontSize: 11, color: "var(--app-ink-3, #7A7975)", marginBottom: 4 }}>
          {p.opening_hours}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {p.phone && (
          <a href={`tel:${p.phone}`} style={{ fontSize: 11, color: "var(--app-cool)", fontWeight: 600 }}>
            Call
          </a>
        )}
        {p.website && (
          <a
            href={p.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--app-cool)", fontWeight: 600 }}
          >
            Website ↗
          </a>
        )}
        <a
          href={`https://www.openstreetmap.org/${p.osm_id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: "var(--app-ink-3, #7A7975)", marginLeft: "auto" }}
        >
          OSM
        </a>
      </div>
    </div>
  );
}
