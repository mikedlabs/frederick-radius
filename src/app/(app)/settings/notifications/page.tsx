import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NotificationsCard from "@/components/settings/NotificationsCard";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Alerts & feedback",
  description:
    "Choose which Frederick Radius alerts appear and whether this device uses phone feedback.",
};

export default function NotificationsSettingsPage() {
  return (
    <div className="relative space-y-5">
      <PageBloom variant="cool" />
      <header className="space-y-2">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Back to Settings
        </Link>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Settings
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Alerts & feedback
        </h1>
        <p className="text-[14px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Choose what this phone should tell you, when it should stay quiet,
          and whether actions should feel tactile.
        </p>
      </header>

      <NotificationsCard />

      <section
        className="rounded-[var(--app-radius-md)] border-l-4 px-3 py-2.5 text-[12px]"
        style={{
          borderColor: "var(--app-ink-3)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)",
        }}
      >
        <p className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
          You stay in control
        </p>
        <p className="mt-1">
          Alert choices and quiet hours apply to this device. Urgent civic
          alerts can bypass quiet hours only when civic alerts are on.
        </p>
      </section>
    </div>
  );
}
