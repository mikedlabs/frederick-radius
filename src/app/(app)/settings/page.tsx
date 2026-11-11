import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut, Mail } from "lucide-react";
import PreferencesPanel from "@/components/settings/PreferencesPanel";
import DataBackup from "@/components/settings/DataBackup";
import { getServerUser } from "@/lib/auth";

/**
 * /settings — the preferences hub.
 *
 * One surface for every device-local pick the user has saved: home
 * municipality, fit defaults, interests, community notes, appearance, and
 * the link down to /settings/notifications for push topics. Also exposes
 * the Reset-and-re-onboard escape hatch.
 *
 * This page is the CONTROL counterpart to the chips on Today (which
 * are AMBIENT — they show what's been picked). Discoverable from the
 * Saved page footer + the back-link on /settings/notifications.
 */

export const metadata: Metadata = {
  robots: { index: false },
  title: "Settings",
  description:
    "Choose how Frederick Radius uses your home area and interests, and manage your account.",
};

export default async function SettingsPage() {
  const user = await getServerUser();
  return (
    <div className="relative space-y-5">
      <header className="space-y-2">
        {/* No page-level Back — the TopBar already renders a ChevronLeft
            back control for every deep (non-tab) page like Settings, and it
            prefers real history over a hardcoded /today (2026-07 shell-
            hardening P6: two stacked Back affordances). */}
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Settings
        </h1>
        <p
          className="text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Change what leads on Today and the Map. Preferences stay on this
          device, while signing in syncs saved places.
        </p>
      </header>

      {/* Account section — Phase 1d. Quiet card at the top of
          Settings so the user can see their sign-in state and sign
          out without hunting. Below the persona/interests block
          because most users will visit Settings to tune the latter,
          not the former. */}
      <section
        aria-label="Account"
        className="border-y py-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        {user ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p
                className="text-[13px] font-semibold uppercase tracking-[0.09em]"
                style={{ color: "var(--app-ink-2)" }}
              >
                Account
              </p>
              <p
                className="mt-1 truncate font-sans text-[17px] font-semibold leading-tight"
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
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-md)] border px-3 text-[13px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
                style={{
                  borderColor: "var(--app-control-border)",
                  background: "var(--app-bg)",
                  color: "var(--app-ink)",
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
            className="group flex min-h-11 items-center gap-3"
          >
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[13px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Sign in to sync saved places
              </span>
              <span
                className="block text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Use a magic link to keep saved places on every device.
              </span>
            </span>
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--app-ink-3)" }}
            >
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            </span>
          </Link>
        )}
      </section>

      <PreferencesPanel />

      {/* Device-only data escape hatch: download / restore the fr:*
          localStorage set as a plain JSON file. Sits below preferences —
          it's insurance, not a daily control. */}
      <DataBackup />
    </div>
  );
}
