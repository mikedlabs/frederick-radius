import type { Metadata } from "next";
import Link from "next/link";
import SubmitPlaceForm from "@/components/submit/SubmitPlaceForm";

export const metadata: Metadata = {
  title: "Submit a place · Frederick Radius",
  description: "Know a Frederick County place we're missing? Send it our way — we'll verify and add it.",
};

export default function SubmitPlacePage() {
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
          Submit a place
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Know a Frederick County business, park, or venue we&apos;re missing? Tell us.
          We&apos;ll cross-check with Google Places + Yelp before publishing.
        </p>
      </header>
      <SubmitPlaceForm />
    </div>
  );
}
