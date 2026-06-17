"use client";

import { useEffect, useState } from "react";

/** PROTOTYPE: live count of aircraft in range, for the /proto/today Overhead
 *  block. Fetches the same cached /api/aircraft proxy the radar uses. */
export default function OverheadCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/aircraft", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (on) setN(j.aircraft?.length ?? 0); })
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return <>{n == null ? "·" : n}</>;
}
