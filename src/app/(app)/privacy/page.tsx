import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Privacy policy for Frederick Radius: what little we collect, what stays on your device, and how community submissions and analytics work.",
};

/**
 * /privacy — public-facing privacy policy.
 *
 * Written to match how the app ACTUALLY works, not a generic template:
 * saves/preferences live in your browser (localStorage), location is used
 * on-device for "near me" and never stored, the only data that reaches our
 * server is what you deliberately submit (corrections, community reports,
 * field markers), and analytics are privacy-friendly + cookieless. Honest and
 * specific beats long and boilerplate.
 *
 * Companion to /terms. Linked from the sitewide footer.
 */
export default function PrivacyPage() {
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-6 py-6">
      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Privacy policy
        </p>
        <h1
          className="font-serif text-[32px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What we collect, plainly.
        </h1>
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Last updated: 2026-07-14
        </p>
      </header>

      <section className="space-y-5 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        <p>
          Frederick Radius is built to need as little of your data as possible.
          Most of what makes the app feel personal never leaves your device. Here
          is the whole picture.
        </p>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Stays on your device
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Saved places and preferences.</strong>{" "}
              Your saved spots, your home town, and whether you&rsquo;re browsing
              as a resident or a visitor are stored in your browser
              (localStorage and a small preference cookie). They are not sent to
              us and not tied to your name.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Location.</strong>{" "}
              If you grant location permission, your position is used in your
              browser to sort &ldquo;near me&rdquo; results and center the map.
              We do not store your location or build a history of where you go.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            What you deliberately send us
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Beta access email.</strong>{" "}
              When you request beta access, we store your email and use it to
              send and manage your personal access code. Our database and
              email-delivery providers process it for us. We do not sell it.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Corrections and feedback.</strong>{" "}
              If you email a correction, we get your message and email address so
              we can fix the entry and reply.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Community reports and field markers.</strong>{" "}
              When you submit a report (a hazard, condition, tip, or note) or
              mark a public amenity, we store what you submitted: the text,
              category, the map point you chose, and any photo you add, so it can
              be reviewed and shown on the map. Don&rsquo;t include
              personal information in these submissions; treat them as public.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Measurement and reliability
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Analytics.</strong>{" "}
              We use privacy-friendly, cookieless analytics to count page views
              and understand which features get used. It does not track you across
              other sites or build an advertising profile.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Error monitoring.</strong>{" "}
              When something breaks, we collect technical diagnostics (the error,
              the page, your browser type) to fix it, not to identify you.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            What we never do
          </h2>
          <p>
            We don&rsquo;t sell your data, we don&rsquo;t run third-party ad
            trackers, and we don&rsquo;t need an account for you to use the app.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Deleting your data
          </h2>
          <p>
            Clear your saves and preferences anytime by clearing this site&rsquo;s
            data in your browser. To have a beta-access email, access code, or
            submission you sent us removed, email{" "}
            <a
              href="mailto:hello@frederickradius.app?subject=Privacy%20request"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--app-brand-press)" }}
            >
              hello@frederickradius.app
            </a>{" "}
            and we&rsquo;ll take care of it.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Accuracy and emergencies
          </h2>
          <p>
            Frederick Radius is an independent local guide. It is not affiliated
            with, endorsed by, or operated by the City of Frederick, Frederick
            County Government, or any municipality. Hours, events, closures, and
            civic information can be out of date. Never rely on this app for
            emergencies or public-safety decisions. Call 911 and follow official
            emergency channels.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Children
          </h2>
          <p>
            Frederick Radius is a general-audience local guide and is not directed
            at children under 13. We don&rsquo;t knowingly collect personal
            information from them.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Changes and contact
          </h2>
          <p>
            If this policy changes, we&rsquo;ll update the date above. Questions?
            Email{" "}
            <a
              href="mailto:hello@frederickradius.app"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--app-brand-press)" }}
            >
              hello@frederickradius.app
            </a>
            . See also our{" "}
            <Link href="/terms" className="font-semibold underline underline-offset-2" style={{ color: "var(--app-brand-press)" }}>
              Terms of use
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
