"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fr:today-standfirst-seen:v1";

/**
 * FirstVisitNote — renders its children only on a visitor's FIRST few loads,
 * then never again. The /today standfirst ("From Downtown to the surrounding
 * towns…") orients a newcomer, but a daily local scrolls past it every visit to
 * reach the actionable grid. So it shows on the first visit and retires itself.
 *
 * Same SSR-safe shape as BetaIntroCard: renders nothing on the server and the
 * first client paint (no hydration mismatch / no flash for returning users),
 * then reveals post-mount only if the seen-flag is unset, and sets the flag so
 * it won't return. A returning user simply never sees it — no layout cost.
 */
export default function FirstVisitNote({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      seen = false;
    }
    if (!seen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydration of a localStorage preference; SSR can't read localStorage
      setShow(true);
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {}
    }
  }, []);

  if (!show) return null;
  return <>{children}</>;
}
