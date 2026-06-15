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
import type { DemoFoodTruck } from "@/data/food-trucks-demo";
import type { DemoPointsPartner } from "@/data/radius-points-demo";
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
          color: "#1A1A1A",
          fontFamily: "var(--font-plex-serif)",
        }}
      >
        {e.title}
      </strong>
      <p style={{ fontSize: 12, margin: "4px 0 8px", color: "#4A4A48" }}>
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

export function PointsPartnerPopup({ p }: { p: DemoPointsPartner }) {
  return (
    <div style={{ minWidth: 220, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "#B8860B", marginBottom: 4,
      }}>
        Radius Points · Preview
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{ fontSize: 12, margin: "4px 0 8px", color: "#4A4A48" }}>{p.kind}</p>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12,
        color: "#7A5A12", background: "#F7EACB", borderRadius: 8,
        padding: "6px 8px", marginBottom: 10,
      }}>
        <span aria-hidden>{"\u{2B50}"}</span>
        {p.earnLine}
      </div>
      <button
        type="button"
        disabled
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: "1px solid var(--app-border)", background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)", fontSize: 12, fontWeight: 600, cursor: "not-allowed",
        }}
      >
        Join Radius Points (coming soon)
      </button>
      <p style={{ fontSize: 10, color: "#9A9892", margin: "6px 0 0", lineHeight: 1.4 }}>
        Radius Points is a preview. There is no account, signup, or payment yet. These partners are sample data.
      </p>
    </div>
  );
}

export function FoodTruckPopup({ t }: { t: DemoFoodTruck }) {
  return (
    <div style={{ minWidth: 220, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--app-brand)", marginBottom: 4,
      }}>
        Food truck · Preview
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {t.name}
      </strong>
      <p style={{ fontSize: 12, margin: "4px 0 8px", color: "#4A4A48" }}>{t.cuisine}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#7A7975", marginBottom: 8 }}>
        <span>Parked at {t.spot}</span>
        <span>Here until {t.hereUntil}</span>
      </div>
      <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {t.menu.map((m) => (
          <li key={m} style={{ fontSize: 12, color: "#4A4A48", display: "flex", gap: 6 }}>
            <span aria-hidden style={{ color: "var(--app-brand)" }}>·</span>{m}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: "1px solid var(--app-border)", background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)", fontSize: 12, fontWeight: 600, cursor: "not-allowed",
        }}
      >
        Order ahead (coming soon)
      </button>
      <p style={{ fontSize: 10, color: "#9A9892", margin: "6px 0 0", lineHeight: 1.4 }}>
        Order ahead is a preview and is not connected yet. These trucks are sample data.
      </p>
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
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{ fontSize: 12, margin: "6px 0", color: "#4A4A48", lineHeight: 1.45 }}>
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
  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "#7A7975", marginBottom: 4,
      }}>
        {cat?.name ?? p.category_slug}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
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
        <p style={{ fontSize: 11, marginTop: 4, color: "#7A7975", textTransform: "capitalize" }}>
          {p.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}
        </p>
      )}
      {(p.address || p.city) && (
        <p style={{ fontSize: 12, margin: "6px 0 4px", color: "#4A4A48", lineHeight: 1.4 }}>
          {[p.address, p.city].filter(Boolean).join(", ")}
        </p>
      )}
      {p.opening_hours && (
        <p style={{ fontSize: 11, color: "#7A7975", marginBottom: 4 }}>
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
          style={{ fontSize: 10, color: "#7A7975", marginLeft: "auto" }}
        >
          OSM
        </a>
      </div>
    </div>
  );
}
