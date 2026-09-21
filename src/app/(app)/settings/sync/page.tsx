import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, Mail, Smartphone } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import SignOutButton from "@/components/settings/SignOutButton";
import SyncStatus from "@/components/settings/SyncStatus";
import { requireServerUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sync & privacy",
  description: "See what follows you between devices and what stays local.",
  robots: { index: false, follow: false },
};

export default async function SyncSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ signout?: string }>;
}) {
  const params = await searchParams;
  const user = await requireServerUser("/settings/sync");

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />
      <header className="space-y-2">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Back to Settings
        </Link>
        <p className="eyebrow" style={{ color: "var(--app-brand)" }}>
          Sync & privacy
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Your Radius comes with you.
        </h1>
        <p className="max-w-2xl text-[14px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Saved places travel between your signed-in devices. The rest of your
          Frederick context stays quietly on this one.
        </p>
      </header>

      {params.signout === "failed" && (
        <div
          role="alert"
          className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--app-danger) 28%, var(--app-border))",
            background: "color-mix(in srgb, var(--app-danger) 6%, var(--app-bg-elevated))",
            color: "var(--app-ink-2)",
          }}
        >
          We couldn&apos;t stop sync, so you&apos;re still signed in on this
          device. Your saves are safe. Try again in a moment.
        </div>
      )}

      <SyncStatus />

      <section
        className="grid gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)] sm:grid-cols-2 sm:p-5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex gap-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-brand)" }} aria-hidden />
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Signed in as
            </p>
            <p className="mt-0.5 break-all text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {user.email ?? "Your Radius account"}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
              No password or public profile
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Sign-in uses a one-time email. It never enrolls you in marketing.
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 sm:p-5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
              What Frederick Radius keeps
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Sync stores your email and saved places. Saved events, routes, home
              spot, interests, searches, and recent views are not
              added to your account. Stopping sync does not clear this device.
            </p>
          </div>
        </div>
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
          <SignOutButton email={user.email} />
        </div>
      </section>
    </div>
  );
}
