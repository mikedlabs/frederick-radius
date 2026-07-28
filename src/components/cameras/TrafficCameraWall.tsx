"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Grid2X2,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import type { TrafficCamera } from "@/lib/integrations/chartCameras";
import { haptic } from "@/lib/haptics";
import { prefersReducedData } from "@/lib/motion";

function updatedLabel(iso: string | null): string {
  if (!iso) return "Status time unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Status time unavailable";
  return `CHART status ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function routeLabel(camera: TrafficCamera): string {
  return camera.route ? `Route ${camera.route}` : "Frederick County";
}

function CameraFrame({
  camera,
  nowMs,
}: {
  camera: TrafficCamera;
  nowMs: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const updatedMs = camera.updatedAt ? Date.parse(camera.updatedAt) : NaN;
  const stale =
    nowMs > 0 &&
    Number.isFinite(updatedMs) &&
    nowMs - updatedMs > 90 * 60 * 1000;

  return (
    <article
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <div
        className="relative aspect-[4/3] overflow-hidden"
        style={{ background: "#111", opacity: stale ? 0.72 : 1 }}
      >
        {!loaded && (
          <div
            className="absolute inset-0 grid place-items-center px-5 text-center"
            role="status"
            style={{ color: "rgba(255,255,255,0.76)" }}
          >
            <span>
              <Video
                className="mx-auto h-7 w-7"
                strokeWidth={1.7}
                aria-hidden
              />
              <span className="mt-2 block text-[12px] font-semibold">
                Connecting to Maryland CHART…
              </span>
            </span>
          </div>
        )}
        <iframe
          src={camera.videoUrl}
          title={`Live Maryland CHART camera at ${camera.name}`}
          loading="lazy"
          allow="autoplay; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full border-0"
          style={{
            opacity: loaded ? 1 : 0,
            filter: stale ? "grayscale(0.65)" : undefined,
            transition: "opacity 420ms ease",
          }}
        />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em]"
              style={{ color: "var(--app-cool)" }}
            >
              {routeLabel(camera)}
            </p>
            <h3
              className="mt-0.5 text-[13px] font-semibold leading-snug"
              style={{ color: "var(--app-ink)" }}
            >
              {camera.name}
            </h3>
          </div>
          <a
            href={camera.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${camera.name} on Maryland CHART`}
            className="tap-44 grid shrink-0 place-items-center"
            style={{ color: "var(--app-ink-3)" }}
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          </a>
        </div>
        <p
          className="mt-1 text-[10px]"
          style={{ color: stale ? "var(--app-warning)" : "var(--app-ink-3)" }}
        >
          {stale ? "Feed status may be stale · " : ""}
          {updatedLabel(camera.updatedAt)}
        </p>
      </div>
    </article>
  );
}

export default function TrafficCameraWall({
  initial,
  initialCameraId,
}: {
  initial: TrafficCamera[];
  initialCameraId?: string;
}) {
  const cameras = useMemo(
    () =>
      [...initial].sort(
        (a, b) =>
          (a.route ?? 9999) - (b.route ?? 9999) ||
          a.name.localeCompare(b.name),
      ),
    [initial],
  );
  const firstId =
    cameras.find((camera) => camera.id === initialCameraId)?.id ??
    cameras[0]?.id ??
    null;
  const [selectedId, setSelectedId] = useState<string | null>(firstId);
  const [wallOn, setWallOn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const selected =
    cameras.find((camera) => camera.id === selectedId) ?? cameras[0];

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    const initialTick = window.setTimeout(update, 0);
    const clock = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(clock);
    };
  }, []);

  if (cameras.length === 0) {
    return (
      <div
        className="rounded-[var(--app-radius-lg)] border p-6 text-center"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
        }}
      >
        <Video
          className="mx-auto h-6 w-6"
          strokeWidth={1.7}
          style={{ color: "var(--app-ink-3)" }}
          aria-hidden
        />
        <p
          className="mt-2 text-[14px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Road cameras are unavailable right now.
        </p>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Radius will try Maryland CHART again on the next refresh.
        </p>
      </div>
    );
  }

  const toggleWall = () => {
    if (!wallOn && prefersReducedData()) {
      haptic("light");
      setNotice(
        "Data Saver is on, so Radius kept the single-camera view.",
      );
      return;
    }
    const next = !wallOn;
    setWallOn(next);
    setNotice(
      next
        ? `${cameras.length} live feeds are loading. This view uses more data.`
        : null,
    );
    haptic(next ? "success" : "light");
  };

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    setNotice("Camera frames are reconnecting.");
    haptic("medium");
  };

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <div>
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            {cameras.length} Frederick County road{" "}
            {cameras.length === 1 ? "camera" : "cameras"}
          </p>
          <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Maryland CHART provides these official public feeds.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleWall}
            aria-pressed={wallOn}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold"
            style={{
              borderColor: wallOn ? "var(--app-cool)" : "var(--app-border)",
              background: wallOn
                ? "color-mix(in srgb, var(--app-cool) 9%, var(--app-bg-elevated))"
                : "var(--app-bg-elevated)",
              color: "var(--app-ink)",
            }}
          >
            <Grid2X2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            {wallOn ? "Single view" : "Live wall"}
          </button>
          <button
            type="button"
            onClick={refresh}
            aria-label="Reconnect live camera frames"
            className="tap-44 grid place-items-center"
            style={{ color: "var(--app-ink-3)" }}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          </button>
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={notice ? "text-[11px]" : "sr-only"}
        style={notice ? { color: "var(--app-ink-3)" } : undefined}
      >
        {notice ?? ""}
      </p>

      {wallOn ? (
        <div className="grid gap-3 md:grid-cols-2">
          {cameras.map((camera) => (
            <CameraFrame
              key={`${camera.id}:${refreshKey}`}
              camera={camera}
              nowMs={nowMs}
            />
          ))}
        </div>
      ) : (
        <>
          {selected && (
            <CameraFrame
              key={`${selected.id}:${refreshKey}`}
              camera={selected}
              nowMs={nowMs}
            />
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cameras.map((camera) => {
              const active = camera.id === selected?.id;
              return (
                <button
                  key={camera.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(camera.id);
                    haptic("light");
                  }}
                  aria-pressed={active}
                  className="min-h-16 rounded-[var(--app-radius-md)] border p-2.5 text-left transition active:scale-[0.98]"
                  style={{
                    borderColor: active
                      ? "var(--app-cool)"
                      : "var(--app-border)",
                    background: active
                      ? "color-mix(in srgb, var(--app-cool) 8%, var(--app-bg-elevated))"
                      : "var(--app-bg-elevated)",
                  }}
                >
                  <span
                    className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: "var(--app-cool)" }}
                  >
                    <Play className="h-3 w-3" fill="currentColor" aria-hidden />
                    {routeLabel(camera)}
                  </span>
                  <span
                    className="mt-1 line-clamp-2 block text-[11px] font-semibold leading-snug"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {camera.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <p
        className="text-[10.5px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        These are current-condition feeds, not recordings. A camera can lag or
        go offline without warning. Open the source link on any frame for the
        official CHART view.
      </p>
    </div>
  );
}
