import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut, Mail } from "lucide-react";
import PreferencesPanel from "@/components/settings/PreferencesPanel";
import DataBackup from "@/components/settings/DataBackup";
import { getServerUser } from "@/lib/auth";
import {
  ROW_HELP,
  ROW_TITLE,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsSection";

/**
 * /settings: the preferences hub.
 *
 * One surface for every device-local pick the user has saved: home
 * municipality, fit defaults, interests, community notes, appearance, and
 * phone feedback. Also exposes the Reset-and-re-onboard escape hatch.
 *
 * This page is the CONTROL counterpart to the chips on Today (which
 * are AMBIENT: they show what's been picked). Discoverable from the
 * Saved page footer. Every section is a 13px uppercase label over ruled
 * rows on the page ground, with no boxes and no coral field.
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
    <div className="relative flex flex-col gap-8">
      <header className="space-y-2">
        {/* No page-level Back: the TopBar already renders a ChevronLeft
            back control for every deep (non-tab) page like Settings, and it
            prefers real history over a hardcoded /today (2026-07 shell-
            hardening P6: two stacked Back affordances). */}
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Settings
        </h1>
        <p
          className="text-[1rem] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Change what leads on Today and the Map. Preferences stay on this
          device, while signing in syncs saved places.
        </p>
      </header>

      {/* Account: sign-in state first, so the user can see it and sign out
          without hunting. */}
      <SettingsSection title="Account">
        {user ? (
          <SettingsRow
            trailing={
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-md)] border px-3 text-[0.875rem] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{
                    borderColor: "var(--app-control-border)",
                    background: "var(--app-bg)",
                    color: "var(--app-ink)",
                  }}
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Sign out
                </button>
              </form>
            }
          >
            <p
              className={`truncate font-sans ${ROW_TITLE}`}
              style={{ color: "var(--app-ink)" }}
            >
              {user.email ?? "Signed in"}
            </p>
            <p className={`mt-0.5 ${ROW_HELP}`} style={{ color: "var(--app-ink-3)" }}>
              Your saved places sync across your devices.
            </p>
          </SettingsRow>
        ) : (
          <Link
            href="/auth/login?next=/settings"
            className="group flex min-h-14 items-center gap-3 py-3"
          >
            <Mail
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block ${ROW_TITLE}`}
                style={{ color: "var(--app-ink)" }}
              >
                Sign in to sync saved places
              </span>
              <span
                className={`mt-0.5 block ${ROW_HELP}`}
                style={{ color: "var(--app-ink-3)" }}
              >
                Use a magic link to keep saved places on every device.
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
            />
          </Link>
        )}
      </SettingsSection>

      <PreferencesPanel />

      {/* Device-only data escape hatch: download / restore the fr:*
          localStorage set as a plain JSON file. It sits below preferences
          because it is insurance, not a daily control. */}
      <DataBackup />
    </div>
  );
}
