import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Frederick Radius collects, uses, shares, retains, and protects information.",
};

const headingClass = "font-serif text-[20px] font-semibold tracking-tight";
const linkClass = "font-semibold underline underline-offset-2";

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
          What the app knows and why.
        </h1>
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Effective July 14, 2026
        </p>
      </header>

      <section className="space-y-5 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        <p>
          Frederick Radius is designed to collect little personal information.
          This policy explains what is processed when you use the app, request
          beta access, sign in, enable notifications, or send something to us.
        </p>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Information kept on your device
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Saves and preferences.</strong>{" "}
              Saved places, home-town and browsing preferences, dismissed items,
              and similar settings are generally stored in your browser using
              local storage and small cookies.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Precise location.</strong>{" "}
              If you grant browser location permission, the app uses that
              location to center maps and rank nearby results. Frederick Radius
              does not store a history of your precise browser-provided location.
            </li>
          </ul>
          <p>
            Clearing this site&rsquo;s browser data removes device-only saves and
            preferences. If you sign in or follow a place, some choices may also
            be stored with your account so they can work across devices.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Information you provide
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Beta access.</strong>{" "}
              We store the email address you enter, the access code associated
              with it, and timestamps and counts used to issue, manage, secure,
              and revoke beta access.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Sign-in and profile.</strong>{" "}
              If you choose to sign in, our authentication provider processes
              your email and session information. We may store app profile,
              saved, or followed-place records associated with your account.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Feedback, corrections, claims, and submissions.</strong>{" "}
              We process the details you send, which may include your name,
              contact information, message, business relationship, and the page
              you were viewing, so we can review, publish, fix, or respond.
            </li>
            <li>
              <strong style={{ color: "var(--app-ink)" }}>Community reports and field markers.</strong>{" "}
              We store the category, text, selected map point, optional name,
              and any photo you submit. Approved material may be public. Do not
              include private personal information or people&rsquo;s faces unless
              you have the right to share them.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Notifications
          </h2>
          <p>
            If you enable push notifications, we store a browser-generated push
            endpoint and encryption keys, the topics you choose, basic device and
            browser labels, your selected home town if provided, and delivery or
            interaction timestamps. This information is used only to manage and
            deliver the notifications you request. You can disable notifications
            in the app or your browser settings.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Technical, security, and measurement data
          </h2>
          <p>
            Hosting, security, analytics, and error-monitoring services may
            process IP address, approximate region derived by the hosting
            platform, request time, page or route, browser and device type,
            performance measurements, and error details. We use this information
            to operate the app, prevent abuse, understand aggregate use, and fix
            failures. We configure error monitoring not to intentionally collect
            user identity or form contents, but technical reports can sometimes
            contain unexpected data.
          </p>
          <p>
            Frederick Radius does not use this information for targeted
            advertising and does not attempt to build a history of your precise
            movements.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Service providers and disclosures
          </h2>
          <p>
            We use service providers to host the app, store data, authenticate
            users, send email and push notifications, measure aggregate use,
            monitor errors, and provide maps or place information. These
            providers currently include Vercel, Supabase, Resend, Plausible,
            Sentry, Mapbox, and Google. They process information under their own
            terms and our configurations.
          </p>
          <p>
            Google may process information when Maps or Places content is
            requested or displayed, as described in the{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              style={{ color: "var(--app-brand-press)" }}
            >
              Google Privacy Policy
            </a>
            .
          </p>
          <p>
            We do not sell personal information or share it for cross-context
            behavioral advertising. We may disclose information when required by
            law, to protect rights or safety, to investigate abuse, or as part of
            a merger, financing, acquisition, or transfer of the project, subject
            to appropriate protections.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Retention and security
          </h2>
          <p>
            We keep information only while it is reasonably needed for the
            purposes above, to resolve disputes, maintain security, or meet legal
            obligations. Public reports expire according to their category;
            rejected and operational records may remain for a limited period to
            prevent abuse and preserve an audit trail. Provider logs and backups
            follow provider retention schedules. A deletion request may not
            immediately remove data from encrypted backups, but restored data
            remains subject to the request.
          </p>
          <p>
            We use access controls, encryption in transit, restricted database
            permissions, and other reasonable safeguards. No online service can
            promise absolute security.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Your choices and requests
          </h2>
          <p>
            You may ask what personal information we have about you, request a
            correction or deletion, or withdraw from beta access by emailing{" "}
            <a
              href="mailto:hello@frederickradius.app?subject=Privacy%20request"
              className={linkClass}
              style={{ color: "var(--app-brand-press)" }}
            >
              hello@frederickradius.app
            </a>
            . We may need to verify the request. Some information may be kept
            when the law permits or requires it. You can also clear browser data,
            revoke location permission, unsubscribe from email, disable push
            notifications, or sign out using the relevant controls.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Children
          </h2>
          <p>
            Frederick Radius is a general-audience guide and is not directed to
            children under 13. We do not knowingly collect personal information
            from children under 13. Contact us if you believe a child submitted
            personal information so we can review and remove it.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Independence, changes, and contact
          </h2>
          <p>
            Frederick Radius is an independent local guide, not a government
            service. If this policy changes, we will update the effective date
            above and provide additional notice when appropriate. Questions can
            be sent to{" "}
            <a href="mailto:hello@frederickradius.app?subject=Privacy%20question" className={linkClass} style={{ color: "var(--app-brand-press)" }}>
              hello@frederickradius.app
            </a>
            . See also our{" "}
            <Link href="/terms" className={linkClass} style={{ color: "var(--app-brand-press)" }}>
              Terms of use
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
