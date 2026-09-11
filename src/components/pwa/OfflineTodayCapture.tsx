"use client";

import { useEffect } from "react";
import {
  persistOfflineTodaySnapshot,
  type TodaySnapshotPatch,
} from "@/lib/offline-snapshot";

/** Writes public, short Today facts only after the online component hydrates. */
export default function OfflineTodayCapture({
  snapshot,
}: {
  snapshot: TodaySnapshotPatch;
}) {
  useEffect(() => {
    if (navigator.onLine === false) return;
    void persistOfflineTodaySnapshot(snapshot).catch(() => {});
  }, [snapshot]);

  return null;
}
