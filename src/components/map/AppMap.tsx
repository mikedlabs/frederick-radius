"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from "react-leaflet";
import { divIcon, type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { Place } from "@/data/places";

type Props = {
  places: Place[];
  height?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  fitBounds?: boolean;
};

const FREDERICK: [number, number] = [39.4143, -77.4105];

export default function AppMap({
  places,
  height = "60vh",
  initialCenter = FREDERICK,
  initialZoom = 12,
  fitBounds = true,
}: Props) {
  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBoundsToPlaces places={places} enabled={fitBounds} />
        {places.map((p) => (
          <PlaceMarker key={p.slug} place={p} />
        ))}
      </MapContainer>
    </div>
  );
}

function PlaceMarker({ place }: { place: Place }) {
  const color = CATEGORY_BY_SLUG[place.category]?.color ?? "#C4451C";
  const icon = useMemo(
    () =>
      divIcon({
        className: "fr-pin",
        html: `
<span style="position:relative;display:inline-block;width:26px;height:26px;">
  <span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.18;transform:scale(1.6);"></span>
  <span style="position:absolute;inset:5px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></span>
</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    [color],
  );
  return (
    <Marker position={[place.geom.lat, place.geom.lng]} icon={icon}>
      <Popup>
        <div style={{ minWidth: 200 }}>
          <strong style={{ display: "block", marginBottom: 4 }}>{place.name}</strong>
          <span style={{ fontSize: 12, color: "#7A7975" }}>
            {CATEGORY_BY_SLUG[place.category]?.name ?? place.category}
          </span>
          <p style={{ fontSize: 13, margin: "8px 0", color: "#1A1A1A" }}>{place.short_blurb}</p>
          <Link
            href={`/places/${place.slug}`}
            style={{ fontSize: 13, fontWeight: 600, color }}
          >
            View →
          </Link>
        </div>
      </Popup>
    </Marker>
  );
}

function FitBoundsToPlaces({ places, enabled }: { places: Place[]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || places.length === 0) return;
    const bounds: LatLngBoundsExpression = places.map((p) => [p.geom.lat, p.geom.lng]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [places, enabled, map]);
  return null;
}
