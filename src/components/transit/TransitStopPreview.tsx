"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Popup } from "react-map-gl/mapbox";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import { navigateAfterHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import StopArrivalsPopup, { type SelectedStop } from "./StopArrivalsPopup";

const HISTORY_LAYER_ID = "transit-stop-preview";

type Props = {
  stop: SelectedStop;
  onClose: (restoreFocus: boolean) => void;
  onUseStop: (stop: SelectedStop) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

type PendingStop = {
  stop: SelectedStop;
  historyDone: boolean;
  exitDone: boolean;
  delivered: boolean;
};

/** One reader and one presentation for this preview's lifetime. Rotating an
 * open phone must not swap out the modal and strand its temporary history. */
export default function TransitStopPreview({ stop, onClose, onUseStop, returnFocusRef }: Props) {
  const [phone] = useState(() => typeof window !== "undefined" &&
    (window.matchMedia?.("(max-width: 639px)")?.matches ?? window.innerWidth < 640));
  const [present, setPresent] = useState(true);
  const pending = useRef<PendingStop | null>(null);
  const closed = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const completeHandoff = (intent: PendingStop) => {
    if (!mounted.current || intent.delivered || !intent.historyDone || !intent.exitDone) return;
    intent.delivered = true;
    closed.current = true;
    onClose(false);
    onUseStop(intent.stop);
  };

  const useStop = () => {
    if (pending.current || closed.current) return;
    const intent: PendingStop = { stop, historyDone: false, exitDone: false, delivered: false };
    pending.current = intent;
    // Start the exit without BottomSheet.dismiss(): the history helper owns
    // the single Back traversal, so these two paths cannot each go back.
    setPresent(false);
    navigateAfterHistoryLayer(HISTORY_LAYER_ID, () => {
      intent.historyDone = true;
      completeHandoff(intent);
    });
  };

  const afterExit = () => {
    if (closed.current) return;
    const intent = pending.current;
    if (!intent) {
      closed.current = true;
      onClose(false);
      return;
    }
    // BottomSheet restores an equivalent marker across at most two frames.
    // Let that finish before the rider handoff focuses My stop elsewhere.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      intent.exitDone = true;
      completeHandoff(intent);
    }));
  };

  if (!phone) return (
    <Popup longitude={stop.lng} latitude={stop.lat} anchor="bottom" offset={14}
      closeOnClick={false} onClose={() => onClose(true)} maxWidth="250px">
      <StopArrivalsPopup key={stop.id} stop={stop} onUseStop={onUseStop} />
    </Popup>
  );

  return (
    <BottomSheet present={present} onClose={afterExit} ariaLabel={`Arrivals at ${stop.name}`}
      historyLayerId={HISTORY_LAYER_ID} returnFocusRef={returnFocusRef} maxHeight="82dvh">
      {(dismiss) => <>
        <SheetHandle onClose={dismiss} closeLabel={`Close arrivals at ${stop.name}`} />
        <header className="shrink-0 border-b px-5 pb-3 pt-1" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>Stop arrivals</p>
          <h2 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)", overflowWrap: "anywhere" }}>{stop.name}</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-[15px] leading-relaxed" data-transit-stop-sheet-body>
          <StopArrivalsPopup key={stop.id} stop={stop} showName={false} />
        </div>
        <footer className="shrink-0 border-t px-5 py-3" style={{ borderColor: "var(--app-border)" }}>
          <button type="button" onClick={useStop} disabled={!present}
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--app-radius-md)] px-3 py-2 text-[15px] font-semibold disabled:opacity-60"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}>
            Use this stop
          </button>
        </footer>
      </>}
    </BottomSheet>
  );
}
