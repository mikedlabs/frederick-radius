"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { MapPin, Image as ImageIcon, Trash2, Copy, Check } from "lucide-react";
import { type PhotoMarker } from "@/components/fair/FairPhotoMap";
import { DEFAULT_FAIR_PHOTO_MARKERS } from "@/data/fair/fair-photo-map-layout";

export default function PhotoMarkerAdmin() {
  const [imageUrl, setImageUrl] = useState("/fair/map_2026.png");
  const [inputUrl, setInputUrl] = useState("/fair/map_2026.png");
  const [markers, setMarkers] = useState<PhotoMarker[]>(DEFAULT_FAIR_PHOTO_MARKERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = Number(((x / rect.width) * 100).toFixed(2));
    const yPercent = Number(((y / rect.height) * 100).toFixed(2));

    const newMarker: PhotoMarker = {
      id: crypto.randomUUID(),
      xPercent,
      yPercent,
      label: "New Marker",
      description: "",
    };

    setMarkers((prev) => [...prev, newMarker]);
    setSelectedId(newMarker.id);
  };

  const updateMarker = (id: string, updates: Partial<PhotoMarker>) => {
    setMarkers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const deleteMarker = (id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selectedMarker = markers.find((m) => m.id === selectedId);

  const handleCopy = () => {
    const json = JSON.stringify(markers, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main
      className="mx-auto max-w-screen-xl px-4 py-8"
      style={{ background: "var(--app-bg)", minHeight: "100vh" }}
    >
      <Link
        href="/admin"
        className="tap-44 inline-flex items-center text-xs"
        style={{ color: "var(--app-cool)" }}
      >
        ← Back to operations desk
      </Link>

      <header className="mt-4 space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Tool
        </p>
        <h1
          className="font-serif text-[28px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Photo Marker
        </h1>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--app-ink)] flex items-center gap-2 mb-4">
              <ImageIcon className="h-5 w-5 text-[var(--app-cool)]" />
              Source Image
            </h2>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="flex-1 rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-[var(--app-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--app-brand)]"
              />
              <button
                onClick={() => setImageUrl(inputUrl)}
                className="rounded-xl bg-[var(--app-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--app-brand)]/90"
              >
                Load
              </button>
            </div>
          </div>

          {imageUrl && (
            <div className="rounded-2xl border border-black/5 bg-white p-2 shadow-sm">
              <div
                ref={imageRef}
                onClick={handleImageClick}
                className="relative w-full cursor-crosshair overflow-hidden rounded-xl bg-black/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Target"
                  className="w-full h-auto block select-none pointer-events-none"
                />

                {markers.map((marker) => {
                  const isActive = selectedId === marker.id;
                  return (
                    <button
                      key={marker.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(marker.id);
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 focus:outline-none ${
                        isActive
                          ? "border-[var(--app-brand)] bg-[var(--app-brand)] text-white scale-110 z-20 shadow-lg"
                          : "border-white bg-white/90 text-[var(--app-ink)] z-10 shadow-md"
                      }`}
                      style={{
                        left: `${marker.xPercent}%`,
                        top: `${marker.yPercent}%`,
                      }}
                    >
                      <MapPin className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-xs text-[var(--app-cool)]">
                Click anywhere on the image to drop a marker.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--app-ink)] mb-4">
              Edit Marker
            </h2>
            {selectedMarker ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--app-ink-2)]">
                    Label
                  </label>
                  <input
                    type="text"
                    value={selectedMarker.label}
                    onChange={(e) =>
                      updateMarker(selectedMarker.id, { label: e.target.value })
                    }
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm focus:border-[var(--app-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--app-brand)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--app-ink-2)]">
                    Description (optional)
                  </label>
                  <textarea
                    value={selectedMarker.description || ""}
                    onChange={(e) =>
                      updateMarker(selectedMarker.id, {
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm focus:border-[var(--app-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--app-brand)]"
                  ></textarea>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="rounded-lg bg-black/5 p-2 text-center text-xs text-[var(--app-ink)]">
                    X: {selectedMarker.xPercent}%
                  </div>
                  <div className="rounded-lg bg-black/5 p-2 text-center text-xs text-[var(--app-ink)]">
                    Y: {selectedMarker.yPercent}%
                  </div>
                </div>
                <button
                  onClick={() => deleteMarker(selectedMarker.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Marker
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--app-cool)] text-center py-8">
                Select a marker on the image to edit it.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--app-ink)]">JSON Output</h2>
              <button
                onClick={handleCopy}
                disabled={markers.length === 0}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--app-brand)] hover:bg-[var(--app-brand)]/10 disabled:opacity-50"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="max-h-[300px] overflow-auto rounded-xl bg-[var(--app-ink)] p-4 text-[10px] text-white">
              {markers.length > 0
                ? JSON.stringify(markers, null, 2)
                : "// No markers yet"}
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}
