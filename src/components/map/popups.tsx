/**
 * The five popup card components rendered inside Mapbox <Popup>s. Plain
 * inline styles because they render into a Mapbox-owned DOM subtree that
 * sits outside React's CSS scope; class-based styles weren't inheriting
 * predictably.
 *
 * Extracted from AppMap.tsx where they were defined at the bottom of the
 * file. No behavior change: same JSX, same imports, same props.
 */
import type { CSSProperties } from "react";
import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { specimenLedger, type LedgerCell } from "@/lib/ui/specimenLedger";
import { ticketStubDate, stubEyebrow } from "@/lib/ui/ticketStub";
import type { EventPin, SelectedOsm, SelectedPlace } from "./types";

/** Semantic color for a ledger cell's tone — open reads positive-green,
 *  the closing "hurry" cell reads warning, everything else stays muted
 *  ink so only the actionable fact carries color. */
const LEDGER_TONE: Record<LedgerCell["tone"], string> = {
  open: "var(--app-positive, #1E6B3A)",
  soon: "var(--app-warning-press, #8F5600)",
  closed: "var(--app-ink-3, #5C5A50)",
  muted: "var(--app-ink-3, #5C5A50)",
};

/** Shared display face for popup titles — Fraunces, with a real serif
 *  fallback so a font miss never drops to sans (the popup lives outside
 *  React's CSS scope, so we can't lean on a class). */
const SERIF = "var(--font-display), ui-serif, Georgia, serif";
/** JetBrains Mono for the data ledger — times, prices, the caption voice. */
const MONO = "var(--font-mono), ui-monospace, 'SFMono-Regular', monospace";

/**
 * Clamp feed-sourced text to N lines with clean wrapping. The feed carries
 * long, messy, sometimes unbroken titles; without this a 120-char title (or a
 * single 60-char token) blows out the fixed-width Mapbox popup. `overflow-wrap:
 * anywhere` breaks a runaway token; the line-clamp caps height. Inline because
 * these popups render into Mapbox-owned DOM outside React's CSS scope.
 */
const clamp = (lines: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: lines,
  overflow: "hidden",
  overflowWrap: "anywhere",
});

/**
 * Event card — the "ticket stub" treatment. A torn-off vertical date stub
 * (MON / 07) on the left, a dashed perforation, then the event body. The
 * silhouette reads as an EVENT at a glance, distinct from the specimen
 * place card — solving the old problem where places and events looked
 * identical in a popup.
 */
export function EventPopup({ e }: { e: EventPin }) {
  const s = ticketStubDate(e.starts_at);
  const color = e.category_color || "var(--app-brand)";
  return (
    <div style={{ display: "flex", minWidth: 244, padding: 2, gap: 0 }}>
      {/* Date stub — the ticket's tear-off. Colored ground so the event's
          category reads even before the title. Fixed width via the padded
          day keeps the stub a stable size. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          padding: "6px 10px 6px 4px",
          color,
          textAlign: "center",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em" }}>
          {s.month}
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1, fontWeight: 600 }}>
          {s.day}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", opacity: 0.7 }}>
          {s.weekday.toUpperCase()}
        </span>
      </div>
      {/* Perforation — the dashed tear line between stub and body. */}
      <div
        aria-hidden
        style={{
          alignSelf: "stretch",
          borderLeft: "1.5px dashed color-mix(in srgb, var(--app-ink) 22%, transparent)",
          margin: "2px 0",
        }}
      />
      <div style={{ flex: 1, minWidth: 0, padding: "4px 4px 4px 10px" }}>
        <p style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color, marginBottom: 3, ...clamp(1) }}>
          {stubEyebrow(s)}
        </p>
        <strong style={{ fontSize: 15, lineHeight: 1.25, color: "var(--app-ink, #16140E)", fontFamily: SERIF, ...clamp(2) }}>
          {e.title}
        </strong>
        {e.venue_name && (
          <p style={{ fontSize: 12, margin: "4px 0 8px", color: "var(--app-ink-2, #423E34)", ...clamp(1) }}>
            {e.venue_name}
          </p>
        )}
        <Link
          href={`/events/${e.slug}`}
          style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color }}
        >
          See event →
        </Link>
      </div>
    </div>
  );
}

/**
 * Place card — the "specimen" treatment. Category plate line, serif name, a
 * hairline rule, then a single mono ledger row of terse facts
 * ("Open · til 6pm · $$") — the field-guide plate-caption voice. The blurb
 * trails below in quiet ink; the ledger, not the prose, is the scannable
 * substance.
 */
export function PlacePopup({ p }: { p: SelectedPlace }) {
  const cat = CATEGORY_BY_SLUG[p.category];
  const catColor = cat?.color ?? "var(--app-brand)";
  const ledger = specimenLedger(p);
  return (
    <div style={{ minWidth: 208, padding: 4 }}>
      <p style={{
        fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: catColor, marginBottom: 4,
      }}>
        {cat?.name ?? p.category}
      </p>
      <strong style={{ fontSize: 15, color: "var(--app-ink, #16140E)", fontFamily: SERIF, ...clamp(2) }}>
        {p.name}
      </strong>
      {ledger.length > 0 && (
        <>
          <div style={{ height: 1, background: "color-mix(in srgb, var(--app-ink) 14%, transparent)", margin: "6px 0" }} aria-hidden />
          <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.01em", ...clamp(1) }}>
            {ledger.map((cell, i) => (
              <span key={i} style={{ color: LEDGER_TONE[cell.tone] }}>
                {i > 0 && <span style={{ color: "var(--app-ink-3, #5C5A50)", margin: "0 5px" }}>·</span>}
                {cell.text}
              </span>
            ))}
          </p>
        </>
      )}
      {p.short_blurb && (
        <p style={{ fontSize: 12, margin: "6px 0", color: "var(--app-ink-2, #423E34)", lineHeight: 1.45, ...clamp(3) }}>
          {p.short_blurb}
        </p>
      )}
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
        <strong style={{ fontSize: 15, color: "var(--app-ink, #16140E)", fontFamily: "var(--font-display), ui-serif, Georgia, serif", ...clamp(2) }}>
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
      <strong style={{ fontSize: 15, color: "var(--app-ink, #1A1A1A)", fontFamily: "var(--font-display), ui-serif, Georgia, serif", ...clamp(2) }}>
        {p.name}
      </strong>
      <p style={{
        marginTop: 4, fontSize: 10, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--app-warning-press)",
      }}>
        ⚠ Unverified · from OpenStreetMap · may be closed or stale
      </p>
      {p.cuisine && (
        <p style={{ fontSize: 11, marginTop: 4, color: "var(--app-ink-3, #7A7975)", textTransform: "capitalize", ...clamp(1) }}>
          {p.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}
        </p>
      )}
      {(p.address || p.city) && (
        <p style={{ fontSize: 12, margin: "6px 0 4px", color: "var(--app-ink-2, #4A4A48)", lineHeight: 1.4 }}>
          {[p.address, p.city].filter(Boolean).join(", ")}
        </p>
      )}
      {p.opening_hours && (
        <p style={{ fontSize: 11, color: "var(--app-ink-3, #7A7975)", marginBottom: 4, ...clamp(2) }}>
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
