import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bookmark, Wifi } from "lucide-react";
import RippleMark from "@/components/brand/RippleMark";
import KeepRadiusCard from "@/components/pwa/KeepRadiusCard";

export const metadata: Metadata = {
  title: "Add Radius to your Home Screen",
  description:
    "Add Frederick Radius to your Home Screen for quick access to Frederick County places, events, and your saved plans. Set up directly from the website.",
  alternates: { canonical: "/install" },
};

/** The app shell owns the one install prompt. This page is a deliberate doorway. */
export default function InstallPage() {
  return (
    <div data-install-page className="mx-auto w-full max-w-xl py-4 sm:py-8">
      <header>
        <RippleMark size={64} tile />
        <h1 className="mt-5 text-[32px] font-semibold leading-[1.1] tracking-tight text-[var(--app-ink)] sm:text-[40px]">
          Radius on your Home Screen
        </h1>
        <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-[var(--app-ink-2)]">
          Add the website from your browser to get back to local events and places in one tap.
        </p>
      </header>

      <div className="mt-6">
        <KeepRadiusCard />
        <Link
          href="/today"
          className="mt-2 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[var(--app-ink-2)] underline decoration-[var(--app-border-strong)] underline-offset-4"
        >
          Open Radius
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <section aria-labelledby="install-expectations" className="mt-7 border-t border-[var(--app-border)] pt-5">
        <h2 id="install-expectations" className="text-[17px] font-semibold text-[var(--app-ink)]">
          Before you add it
        </h2>
        <div className="mt-4 flex items-start gap-3">
          <Wifi className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-ink-3)]" aria-hidden />
          <p className="text-[14px] leading-relaxed text-[var(--app-ink-2)]">
            <strong className="block text-[var(--app-ink)]">Offline access</strong>
            See a recent Today summary and your saved count when available.
            Reconnect to open saved addresses, maps, and live updates.
          </p>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <Bookmark className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-ink-3)]" aria-hidden />
          <p className="text-[14px] leading-relaxed text-[var(--app-ink-2)]">
            <strong className="block text-[var(--app-ink)]">Your saved places</strong>
            Sign in to sync saved places across devices.
            Saved events and routes stay here unless you export a backup from Settings.
          </p>
        </div>
      </section>
    </div>
  );
}
