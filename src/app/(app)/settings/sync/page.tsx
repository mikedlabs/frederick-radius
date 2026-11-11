import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, Mail, Smartphone } from "lucide-react";
import SignOutButton from "@/components/settings/SignOutButton";
import SyncStatus from "@/components/settings/SyncStatus";
import { requireServerUser } from "@/lib/auth";
import {
  ROW_HELP,
  SECTION_LABEL,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsSection";

export const metadata: Metadata = {
  title: "Sync & privacy",
  description: "See what follows you between devices and what stays local.",
  robots: { index: false, follow: false },
};

/**
 * /settings/sync: what follows a signed-in visitor between devices. Same
 * plain tool language as /settings: labelled runs of ruled rows on the page
 * ground, plain ink glyphs and no boxes.
 */
export default async function SyncSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ signout?: string }>;
}) {
  const params = await searchParams;
  const user = await requireServerUser("/settings/sync");

  return (
    <div className="relative flex flex-col gap-8">
      <header className="space-y-2">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-1 text-[0.875rem] font-semibold"
          style={{ color: "var(--app-ink-2)" }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Back to Settings
        </Link>
        <p className={SECTION_LABEL} style={{ color: "var(--app-ink-2)" }}>
          Sync & privacy
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Your Radius comes with you.
        </h1>
        <p className="max-w-2xl text-[1rem] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Places in My Radius travel between your signed-in devices. The rest of
          your Frederick context stays quietly on this one.
        </p>
      </header>

      {params.signout === "failed" && (
        <div
          role="alert"
          className="border-y py-3 text-[0.875rem] leading-relaxed"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-danger-text)",
          }}
        >
          We couldn&apos;t stop sync, so you&apos;re still signed in on this
          device. Your saves are safe. Try again in a moment.
        </div>
      )}

      <SyncStatus />

      <SettingsSection title="Account">
        <SettingsRow>
          <div className="flex gap-3">
            <Mail className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold" style={{ color: "var(--app-ink)" }}>
                Signed in as
              </p>
              <p className={`mt-0.5 break-all ${ROW_HELP}`} style={{ color: "var(--app-ink-2)" }}>
                {user.email ?? "Your Radius account"}
              </p>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow>
          <div className="flex gap-3">
            <LockKeyhole className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold" style={{ color: "var(--app-ink)" }}>
                No password or public profile
              </p>
              <p className={`mt-0.5 ${ROW_HELP}`} style={{ color: "var(--app-ink-3)" }}>
                Sign-in uses a one-time email. It never enrolls you in marketing.
              </p>
            </div>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="What Frederick Radius keeps">
        <SettingsRow>
          <div className="flex gap-3">
            <Smartphone className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <p className="min-w-0 text-[1rem] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Sync stores your email and the places in My Radius. Saved events,
              routes, home spot, interests, searches, and recent views are not
              added to your account. Stopping sync does not clear this device.
            </p>
          </div>
        </SettingsRow>
        <SettingsRow>
          <SignOutButton email={user.email} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
