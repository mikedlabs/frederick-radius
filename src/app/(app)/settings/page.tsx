import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Cloud, Mail } from "lucide-react";
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
  title: "Settings",
  description:
    "How Frederick Radius is tuned for you. Persona, where you're anchored, what you're into, and what you hear from us.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await getServerUser();
  return (
    <div className="relative space-y-5">
      <PageBloom variant="cool" />
      <header className="space-y-2">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Back
        </Link>
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
          Every pick here changes what surfaces on Today and Radius.
          Nothing here is required. Place sync is optional; the rest stays on
          this device.
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
          <Link href="/settings/sync" className="group flex min-h-11 items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-positive) 13%, transparent)",
                color: "var(--app-positive)",
              }}
            >
              <Cloud className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-positive)" }}
              >
                Place sync is on
              </p>
              <p
                className="mt-1 truncate font-serif text-[16px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Sync & privacy
              </p>
              <p
                className="mt-1 text-[11.5px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {user.email ?? "Signed in"} · See what travels between devices.
              </p>
            </div>
            <ChevronRight
              className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </Link>
        ) : (
          <Link
            href="/auth/login?next=/settings/sync"
            className="group flex min-h-11 items-center gap-3"
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
                Keep your places across devices
              </span>
              <span
                className="block text-[11.5px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                One sign-in email. Only places in My Radius are synced.
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </Link>
        )}
      </section>

      <PreferencesPanel />
    </div>
  );
}
