import type { Metadata } from "next";
import Link from "next/link";
import SubmitEventForm from "@/components/submit/SubmitEventForm";

export const metadata: Metadata = {
  // Root layout's metadata.title.template adds " · Frederick Radius";
  // including it here would double-suffix.
  title: "Submit an event",
  description: "Hosting something in Frederick County? Send the details and we'll surface it.",
};

export default function SubmitEventPage() {
  return (
    <div
      className="mx-auto max-w-screen-md px-4"
      style={{
        background: "var(--app-bg)",
        paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Link href="/" className="text-xs" style={{ color: "var(--app-cool)" }}>← Back to Frederick Radius</Link>
      <header className="mt-4 space-y-2">
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Submit an event
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Hosting an event in Frederick County? Tell us the details and we&apos;ll surface it
          on the Today screen, the Events page, and the relevant town page.
        </p>
      </header>
      <SubmitEventForm />
    </div>
  );
}
