import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import SubmitForm from "./SubmitForm";

/**
 * /dear-frederick/submit — send in a letter digitally.
 *
 * The project began with letters mailed to a PO box, and that is still the
 * heart of it. This page adds a second way in for people who would rather send
 * a photo of what they wrote. A submission lands in the owner's review queue,
 * never straight onto the wall: the owner reads it, and letters that fit are
 * transcribed by hand, so the page keeps publishing curated. The copy is honest
 * about that so nobody expects to see their letter appear instantly.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/dear-frederick/submit" },
  title: "Submit a letter · Dear Frederick",
  description:
    "Send a photo of a handwritten letter to Frederick. We read every one, and letters that fit the wall are added by hand.",
};

export default function DearFrederickSubmitPage() {
  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="max-w-[42rem] space-y-3">
        <h1 className="display-1 font-editorial" style={{ color: "var(--app-ink)" }}>
          Submit a letter
        </h1>
        <p className="font-serif text-[16px] leading-[1.6]" style={{ color: "var(--app-ink)" }}>
          Write to Frederick and send us a photo of the page. The handwriting is the whole point, so
          your letter stays in your own hand.
        </p>
        <p className="text-[14px] leading-[1.65]" style={{ color: "var(--app-ink-2)" }}>
          We read every letter that comes in. The ones that fit the wall are transcribed by hand and
          added to the collection, so it is not instant. You can sign your letter or leave it
          anonymous.
        </p>
      </header>

      <SubmitForm />

      {/* The mailed letter is still the original invitation. Keep the PO box
          here for anyone who would rather put a stamp on it. */}
      <section
        aria-labelledby="mail-heading"
        className="max-w-[42rem] rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border-strong, var(--app-border))",
          background: "var(--app-bg-sunken)",
        }}
      >
        <h2 id="mail-heading" className="font-serif text-[16px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Rather mail it
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.6]" style={{ color: "var(--app-ink-2)" }}>
          Put it on paper and send it to the box downtown.
        </p>
        <p className="mt-2 font-mono text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
          Dear Frederick
          <br />
          PO Box 334
          <br />
          Frederick, MD 21705
        </p>
      </section>

      <Link
        href="/dear-frederick"
        className="tap-44 inline-flex items-center gap-1.5 text-[13px] font-semibold"
        style={{ color: "var(--app-cool)" }}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Back to the letters
      </Link>
    </div>
  );
}
