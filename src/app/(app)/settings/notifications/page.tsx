import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NotificationsCard from "@/components/settings/NotificationsCard";
import PageBloom from "@/components/ui/PageBloom";
import { parkingFeedConfigured } from "@/lib/integrations/parking-live";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Notifications",
  description:
    "Choose what you hear from Frederick Radius. Civic alerts, saved event reminders, daily briefing.",
};

export default function NotificationsSettingsPage() {
  return (
    <div className="relative space-y-5">
      <PageBloom variant="cool" />
      <header className="space-y-2">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Back to Settings
        </Link>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Settings
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Notifications
        </h1>
        <p className="text-[14px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Get a quiet ping when something you care about happens. Topics
          are off until you turn them on, and you can disconnect from
          this device anytime.
        </p>
      </header>

      {/* "garage-full" is offered only when the live parking feed is wired —
          otherwise the toggle would never fire. */}
      <NotificationsCard extraTopics={parkingFeedConfigured() ? ["garage-full"] : []} />

      <section
        className="rounded-[var(--app-radius-md)] border-l-4 px-3 py-2.5 text-[12px]"
        style={{
          borderColor: "var(--app-ink-3)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)",
        }}
      >
        <p className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
          What we send
        </p>
        <p className="mt-1">
          Only the topics you turn on. Nothing else. We don&apos;t send
          marketing, growth nags, or pings outside the bands you pick.
          You can unsubscribe in one tap.
        </p>
      </section>
    </div>
  );
}
