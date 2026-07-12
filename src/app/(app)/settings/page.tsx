import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, Mail } from "lucide-react";
import PreferencesPanel from "@/components/settings/PreferencesPanel";
import PageBloom from "@/components/ui/PageBloom";
import { getServerUser } from "@/lib/auth";

/**
 * /settings — the preferences hub.
 *
 * One surface for every device-local pick the user has saved: persona
 * (Visitor / Resident), home municipality, interests, and the link
 * down to /settings/notifications for push topics. Also exposes the
 * Reset-and-re-onboard escape hatch.
 *
 * This page is the CONTROL counterpart to the chips on Today (which
 * are AMBIENT — they show what's been picked). Discoverable from the
 * Saved page footer + the back-link on /settings/notifications.
 */

export const metadata: Metadata = {
  robots: { index: false },
  title: "Settings",
  description:
    "How Frederick Radius is tuned for you. Persona, where you're anchored, what you're into, and what you hear from us.",
};

export default async function SettingsPage() {
  const user = await getServerUser();
  return (
    <div className="relative space-y-5">
      <PageBloom variant="cool" />
      <header className="space-y-2">
        {/* No page-level Back — the TopBar already renders a ChevronLeft
            back control for every deep (non-tab) page like Settings, and it
            prefers real history over a hardcoded /today (2026-07 shell-
            hardening P6: two stacked Back affordances). */}
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Settings
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          How we&apos;re tuned for you.
        </h1>
        <p
          className="text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Every pick here tunes what leads on Today and the Map.
          Nothing here is required, and nothing here is shared.
        </p>
      </header>

      {/* Account section — Phase 1d. Quiet card at the top of
          Settings so the user can see their sign-in state and sign
          out without hunting. Below the persona/interests block
          because most users will visit Settings to tune the latter,
          not the former. */}
      <section
        aria-label="Account"
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        {user ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Account
              </p>
              <p
                className="mt-1 truncate font-serif text-[16px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {user.email ?? "Signed in"}
              </p>
              <p
                className="mt-1 text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Your saved places sync across your devices.
              </p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="tactile tactile-interactive inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-sunken)",
                  color: "var(--app-ink-2)",
                }}
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/auth/login?next=/settings"
            className="group flex items-center gap-3"
          >
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[13px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Sign in to sync across devices
              </span>
              <span
                className="block text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Magic link, no password. Your saves come with you.
              </span>
            </span>
            <span
              aria-hidden
              className="text-[11px] font-bold transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--app-ink-3)" }}
            >
              →
            </span>
          </Link>
        )}
      </section>

      <PreferencesPanel />
    </div>
  );
}
