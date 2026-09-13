"use client";

import Image from "next/image";
import {
  CalendarDays,
  FerrisWheel,
  MapPinned,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import BottomSheet from "@/components/ui/BottomSheet";
import { X } from "lucide-react";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import {
  FAIR_PHOTO_PREVIEW,
  FAIR_PHOTO_VIEWER_PATH,
  readFairPhotoViewerMessage,
} from "@/lib/fair/photo-viewer";

import FairShareButton from "./FairShareButton";

type FairPhotoLandmarkId = "grandstand" | "midway" | "ferris-wheel";

const LANDMARKS: Array<{
  id: FairPhotoLandmarkId;
  number: number;
  label: string;
  eyebrow: string;
  detail: string;
  x: string;
  y: string;
  tone: string;
}> = [
  {
    id: "grandstand",
    number: 1,
    label: "Grandstand",
    eyebrow: "Shows and racing",
    detail:
      "Use the day you chose to see the reviewed Grandstand schedule, then open its reviewed location on the grounds map.",
    x: "14%",
    y: "24%",
    tone: "var(--app-accent)",
  },
  {
    id: "midway",
    number: 2,
    label: "Midway",
    eyebrow: "Rides, lights and games",
    detail:
      "Start with the ride-focused program view. Individual ride placement can change, so follow current Fair signs on the grounds.",
    x: "51%",
    y: "52%",
    tone: "var(--app-warning-press)",
  },
  {
    id: "ferris-wheel",
    number: 3,
    label: "Ferris wheel",
    eyebrow: "A visual landmark",
    detail:
      "This recognizable landmark is from a previous Fair. Use it for orientation, then check the current program and on-site signs.",
    x: "81%",
    y: "55%",
    tone: "var(--app-cool)",
  },
];

type ViewerState = "idle" | "loading" | "ready" | "photo-only";

export default function FairPhotoExplorer({
  open,
  onOpenChange,
  onShowGrandstandMap,
  onShowGrandstandProgram,
  onFindRides,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowGrandstandMap: () => void;
  onShowGrandstandProgram: () => void;
  onFindRides: () => void;
}) {
  const [selectedId, setSelectedId] =
    useState<FairPhotoLandmarkId>("grandstand");
  const [viewerState, setViewerState] = useState<ViewerState>("idle");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const historyLayer = useReversibleHistoryLayer({
    active: open,
    id: "fair-photo-explorer",
    onDismiss: () => onOpenChange(false),
  });
  const selected =
    LANDMARKS.find((landmark) => landmark.id === selectedId) ?? LANDMARKS[0];

  useEffect(() => {
    if (!open) return;
    const loadingFrame = window.requestAnimationFrame(() =>
      setViewerState("loading"),
    );
    const timeout = window.setTimeout(() => setViewerState("photo-only"), 10_000);
    const receiveViewerMessage = (event: MessageEvent) => {
      const message = readFairPhotoViewerMessage(
        event,
        window.location.origin,
        iframeRef.current?.contentWindow ?? null,
      );
      if (!message) return;
      window.clearTimeout(timeout);
      setViewerState(message.status === "ready" ? "ready" : "photo-only");
    };
    window.addEventListener("message", receiveViewerMessage);
    return () => {
      window.cancelAnimationFrame(loadingFrame);
      window.clearTimeout(timeout);
      window.removeEventListener("message", receiveViewerMessage);
    };
  }, [open]);

  const closeOrOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    historyLayer.dismiss();
  };

  const leaveFor = (next: () => void) => historyLayer.leave(next);

  return (
    <BottomSheet
      present={open}
      onClose={() => closeOrOpen(false)}
      ariaLabel="See the Fair at night"
    >
      {(dismiss) => (
        <div
          data-fair-photo-explorer
          className="mx-auto flex h-full w-full max-w-[60rem] flex-col"
        >
          {/* Custom bare header drag handle + close */}
          <div className="absolute left-0 right-0 top-0 z-50 flex h-14 items-center justify-end px-3">
            <div className="pointer-events-none absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/40 shadow-sm" />
            <button
              onClick={dismiss}
              aria-label="Close photo explorer"
              className="tap-44-xy grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition active:scale-95"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
        <div
          className="relative aspect-video overflow-hidden bg-[var(--app-ink)]"
          data-fair-photo-stage
        >
          <Image
            src={FAIR_PHOTO_PREVIEW}
            alt="The Great Frederick Fairgrounds glowing at night, photographed from above during a previous Fair."
            fill
            sizes="(min-width: 640px) 640px, 100vw"
            unoptimized
            className="absolute inset-0 h-full w-full object-cover"
          />
          {open ? (
            <iframe
              ref={iframeRef}
              src={FAIR_PHOTO_VIEWER_PATH}
              title="Fair night light reveal"
              aria-hidden="true"
              tabIndex={-1}
              loading="eager"
              sandbox="allow-same-origin allow-scripts"
              className="pointer-events-none absolute inset-0 h-full w-full border-0"
              data-fair-photo-viewer
            />
          ) : null}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70"
            aria-hidden
          />
          {LANDMARKS.map((landmark) => {
            const active = landmark.id === selected.id;
            return (
              <button
                key={landmark.id}
                type="button"
                aria-label={`Show ${landmark.label} in the photograph`}
                aria-pressed={active}
                onClick={() => setSelectedId(landmark.id)}
                data-fair-photo-landmark={landmark.id}
                className="tap-44 absolute z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{ left: landmark.x, top: landmark.y }}
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full border-2 text-[11px] font-extrabold tabular-nums transition-transform motion-reduce:transition-none"
                  style={{
                    color: active ? "var(--app-ink)" : "white",
                    background: active ? "var(--app-amber)" : "rgba(22, 18, 14, 0.72)",
                    borderColor: "white",
                    boxShadow: active
                      ? "0 0 0 4px rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.45)"
                      : "0 3px 12px rgba(0,0,0,0.45)",
                    transform: active ? "scale(1.08)" : undefined,
                  }}
                  aria-hidden
                >
                  {landmark.number}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-6 pt-3 sm:px-6 sm:pt-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <p
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] sm:text-[11px]"
                style={{ color: "var(--app-accent-press)" }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Explore the lights
              </p>
              <h2 className="mt-0.5 font-editorial text-[27px] font-normal leading-none tracking-[-0.025em] sm:text-[34px]">
                The Fair, from above
              </h2>
            </div>
            <p
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.09em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <ScanLine className="h-3.5 w-3.5" aria-hidden />
              Real photo · previous Fair
            </p>
          </div>
          <section
            className="mt-3 border-l-4 pl-4"
            style={{ borderColor: selected.tone }}
            aria-live="polite"
            aria-atomic="true"
          >
            <p
              className="text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ color: selected.tone }}
            >
              {selected.eyebrow}
            </p>
            <h3 className="mt-1 text-[23px] font-bold leading-tight tracking-[-0.03em]">
              {selected.label}
            </h3>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {selected.id === "grandstand" ? (
                <>
                  <Button
                    className="min-h-11 w-full py-2.5 text-center sm:w-auto"
                    style={{ height: "auto", lineHeight: 1.25, whiteSpace: "normal" }}
                    onClick={() => leaveFor(onShowGrandstandProgram)}
                    iconLeft={<CalendarDays className="h-4 w-4" aria-hidden />}
                  >
                    See Grandstand program
                  </Button>
                  <Button
                    className="min-h-11 w-full py-2.5 text-center sm:w-auto"
                    style={{ height: "auto", lineHeight: 1.25, whiteSpace: "normal" }}
                    variant="secondary"
                    onClick={() => leaveFor(onShowGrandstandMap)}
                    iconLeft={<MapPinned className="h-4 w-4" aria-hidden />}
                  >
                    Show on Fair map
                  </Button>
                </>
              ) : (
                <Button
                  className="min-h-11 w-full py-2.5 text-center sm:w-auto"
                  style={{ height: "auto", lineHeight: 1.25, whiteSpace: "normal" }}
                  onClick={() => leaveFor(onFindRides)}
                  iconLeft={<FerrisWheel className="h-4 w-4" aria-hidden />}
                >
                  Find rides and midway
                </Button>
              )}
            </div>
            <p
              className="mt-3 max-w-[56ch] text-[14px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              {selected.detail}
            </p>
          </section>

          <div
            className="mt-5 border-t pt-4"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-[0.09em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Landmarks in the photo
            </p>
            <ul
              className="mt-2 flex flex-wrap gap-x-4 gap-y-2"
              aria-label="Landmark key"
            >
              {LANDMARKS.map((landmark) => {
                const active = landmark.id === selected.id;
                return (
                  <li
                    key={landmark.id}
                    className="inline-flex min-h-8 items-center gap-2 text-[13px] font-bold"
                    style={{
                      color: active ? landmark.tone : "var(--app-ink-2)",
                    }}
                  >
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold text-[var(--app-ink-inverse)] tabular-nums"
                      style={{ background: landmark.tone }}
                      aria-hidden
                    >
                      {landmark.number}
                    </span>
                    {landmark.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p
              className="max-w-[38ch] text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              Radius reviews current places and times against the official 2026 Fair guide.
            </p>
            <FairShareButton />
          </div>

          <p
            className="mt-4 text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            Use the photograph to recognize the grounds. Ride placement can
            change, so follow current on-site signs.
          </p>
          <span className="sr-only" role="status" aria-live="polite">
            {viewerState === "ready"
              ? "The Fair night light reveal is ready."
              : viewerState === "photo-only"
                ? "Showing the original Fair photograph."
                : ""}
          </span>
        </div>
      </div>
      )}
    </BottomSheet>
  );
}
