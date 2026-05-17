"use client";

import Map, { Marker, NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

import { MAPBOX_TOKEN } from "@/lib/mapbox";
const STYLE_URL = "mapbox://styles/mapbox/dark-v11";

export default function PlaceMiniMapInner({
  lng,
  lat,
  color = "#C4451C",
  height = 176,
  zoom = 15,
}: {
  lng: number;
  lat: number;
  color?: string;
  height?: number;
  zoom?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: lng, latitude: lat, zoom }}
        mapStyle={STYLE_URL}
        style={{ width: "100%", height: "100%" }}
        attributionControl={true}
        scrollZoom={false}
        dragRotate={false}
        touchPitch={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Marker longitude={lng} latitude={lat} anchor="center">
          <span
            className="block relative"
            style={{ width: 22, height: 22 }}
            aria-hidden
          >
            <span
              style={{
                position: "absolute", inset: 0, borderRadius: "9999px",
                background: color, opacity: 0.18, transform: "scale(1.7)",
              }}
            />
            <span
              style={{
                position: "absolute", inset: 4, borderRadius: "9999px",
                background: color, border: "2px solid #fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
              }}
            />
          </span>
        </Marker>
      </Map>
    </div>
  );
}
