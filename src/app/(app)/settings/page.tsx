import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PreferencesPanel from "@/components/settings/PreferencesPanel";
import PageBloom from "@/components/ui/PageBloom";

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
};

export default function SettingsPage() {
  return (
    <div className="relative space-y-5">
      <PageBloom variant="cool" />
      <header className="space-y-2">
        <Link
          href="/now"
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
          Nothing here is required, and nothing here is shared.
        </p>
      </header>

      <PreferencesPanel />
    </div>
  );
}
