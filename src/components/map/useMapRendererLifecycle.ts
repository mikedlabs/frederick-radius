"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mapboxFailureKind } from "./mapboxFailure";

export const MAP_RENDERER_LOAD_TIMEOUT_MS = 10_000;

/** A slow renderer keeps its context while the readable list is available.
 * Hard failures stay terminal for this mount, even if an old load arrives. */
export function useMapRendererLifecycle({
  configured,
  supportsWebGL,
  onVisualReady,
}: {
  configured: boolean;
  supportsWebGL: () => boolean;
  onVisualReady?: () => void;
}) {
  const [failureKind, setFailureKind] = useState<"soft" | "hard" | null>(() => configured ? null : "hard");
  const failureRef = useRef(failureKind);
  const [mapLoaded, setMapLoaded] = useState(false);
  const loadedRef = useRef(false);
  const [mapUnsupported, setMapUnsupported] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const activeRef = useRef(true);
  const visualReadyRef = useRef(onVisualReady);
  useEffect(() => { visualReadyRef.current = onVisualReady; }, [onVisualReady]);

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      clearLoadTimeout();
    };
  }, [clearLoadTimeout]);

  const fail = useCallback((kind: "soft" | "hard") => {
    if (!activeRef.current || failureRef.current === "hard" || failureRef.current === kind) return;
    failureRef.current = kind;
    setFailureKind(kind);
    if (kind === "hard") clearLoadTimeout();
    visualReadyRef.current?.();
  }, [clearLoadTimeout]);

  useEffect(() => {
    if (!configured) {
      visualReadyRef.current?.();
      return;
    }
    if (!supportsWebGL()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize the post-mount browser WebGL capability; no server capability claim is possible
      setMapUnsupported(true);
      fail("hard");
      return;
    }
    if (loadedRef.current || failureRef.current === "hard") return;
    const timeout = window.setTimeout(() => {
      if (timeoutRef.current === timeout) timeoutRef.current = null;
      // A load or fatal event can precede a queued timer's React commit.
      if (!loadedRef.current && failureRef.current !== "hard") fail("soft");
    }, MAP_RENDERER_LOAD_TIMEOUT_MS);
    timeoutRef.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      if (timeoutRef.current === timeout) timeoutRef.current = null;
    };
  }, [configured, fail, supportsWebGL]);

  const markLoaded = useCallback(() => {
    if (!activeRef.current || failureRef.current === "hard") return false;
    loadedRef.current = true;
    clearLoadTimeout();
    setMapLoaded(true);
    if (failureRef.current === "soft") {
      failureRef.current = null;
      setFailureKind(null);
    }
    return true;
  }, [clearLoadTimeout]);

  const reportError = useCallback((message: string) => {
    const kind = mapboxFailureKind(message, loadedRef.current);
    if (kind) fail(kind);
  }, [fail]);

  return {
    failureKind,
    mapError: failureKind !== null,
    mapLoaded,
    mapUnsupported,
    mountRenderer: configured && failureKind !== "hard",
    markLoaded,
    reportError,
  };
}
