"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X, Home, Plane, Briefcase } from "lucide-react";

/**
 * TuneForYou — a small dismissible row that surfaces the persona
 * pick the killed onboarding gate used to enforce.
 *
 * Why this exists
 *   The /now → /welcome middleware redirect was removed pre-launch
 *   (review §1) so a first-time visitor sees the field guide instead
 *   of a setup wizard. But the persona pick still has real value —
 *   it adjusts the welcome flow's defaults (interests, home muni)
 *   for visitors vs. locals vs. owners. This row preserves that
 *   affordance without ever blocking the product.
 *
 * Behavior
 *   - Hidden until mount so SSR doesn't flash the row to users who
 *     have already dismissed it.
 *   - Each pill is a link to /welcome with a `?as=` param so the
 *     flow can pre-select the persona on arrival. The flow doesn't
 *     read that param yet; this PR just gets the pills wired so the
 *     handoff exists. The welcome flow upgrade lands in a follow-up.
 *   - Dismissal is keyed at `fr:tune-for-you-dismissed:v1` so a
 *     future copy change can bump the suffix and re-show.
 *
 * Visual register
 *   Quiet by design — eyebrow + three small pills + ×. Reads as
 *   instructive, not promotional. Bordered card so it sits flush
 *   with the rest of /now's editorial register but never steals
 *   attention from the weather block below.
 */

const KEY = "fr:tune-for-you-dismissed:v1";

const PILLS = [
  { as: "local",    label: "I live here",     icon: Home },
  { as: "visiting", label: "I'm visiting",    icon: Plane },
  { as: "owner",    label: "I own a business", icon: Briefcase },
] as const;

export default function TuneForYou() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(KEY) === "true";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate after mount; localStorage isn't readable during SSR
      if (!dismissed) setShow(true);
    } catch {
      // localStorage unavailable; default to showing. A missed
      // dismiss across a single session is fine for an opt-in row.
      setShow(true);
    }
    setMounted(true);
  }, []);

  if (!mounted || !show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, "true");
    } catch {
      // ignore
    }
  };

  return (
    <section
      aria-label="Tune this for you"
      className="relative flex items-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Tune this for you
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {PILLS.map(({ as, label, icon: Icon }) => (
            <li key={as}>
              <Link
                href={`/welcome?as=${as}`}
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.97]"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-sunken)",
                  color: "var(--app-ink-2)",
                }}
              >
                <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="tap-44 grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-[var(--app-bg-sunken)]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    </section>
  );
}
