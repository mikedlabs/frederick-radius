import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "Terms for using Frederick Radius, including accuracy, submissions, acceptable use, and important disclaimers.",
};

const headingClass = "font-serif text-[20px] font-semibold tracking-tight";
const linkClass = "font-semibold underline underline-offset-2";

export default function TermsPage() {
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-6 py-6">
      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Terms of use
        </p>
        <h1
          className="font-serif text-[32px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The rules, in plain language.
        </h1>
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Effective July 15, 2026
        </p>
      </header>

      <section className="space-y-5 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        <p>
          By using Frederick Radius, you agree to these terms and our{" "}
          <Link href="/privacy" className={linkClass} style={{ color: "var(--app-cool)" }}>
            Privacy Policy
          </Link>
          . If you do not agree, do not use the app.
        </p>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Independent local guide
          </h2>
          <p>
            Frederick Radius is an independent project. It is not affiliated
            with, endorsed by, sponsored by, or operated by the City of
            Frederick, Frederick County Government, or any municipality. A link,
            listing, seal-free source label, or reference to an organization does
            not mean that organization endorses Frederick Radius.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Information, not a guarantee
          </h2>
          <p>
            The app is a planning and discovery aid. Places close, hours change,
            events move, routes become unavailable, and public information can be
            delayed or wrong. Confirm important details with the business,
            organizer, transit provider, or government agency before acting.
            Maps, distances, travel times, alerts, and recommendations are
            estimates and may not reflect current conditions.
          </p>
          <p>
            Do not use Frederick Radius for emergencies, public-safety decisions,
            medical advice, legal advice, or other situations where an error could
            cause harm. Call 911 in an emergency and use official sources for
            urgent instructions.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Accounts and legacy access codes
          </h2>
          <p>
            You are responsible for activity under your account or any optional
            access code tied to you. Do not sell, automate, probe, or misuse
            access credentials. We may limit, suspend, or revoke access to protect
            the app, its users, or its data sources.
          </p>
          <p>
            The public app no longer requires a beta code. Older beta codes and
            member cards may still support invitations, feedback, or device-linked
            features; they are not a confidentiality or security boundary. Do not
            submit or rely on confidential material. When you share a link, common
            messaging and social preview services may fetch that page to generate
            its title, description, and image.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Submissions
          </h2>
          <p>
            You keep ownership of content you submit. You give Frederick Radius
            a non-exclusive, worldwide, royalty-free license to store, review,
            reproduce, edit for clarity or safety, publish, and remove that
            content as needed to operate and improve the app. This license ends
            when the content is deleted from active systems, except for reasonable
            backups and records needed for legal or security purposes.
          </p>
          <p>
            Submit only content you have the right to share. Do not submit private
            personal information, unlawful material, threats, harassment,
            impersonation, malware, spam, or content that infringes another
            person&rsquo;s rights. Public reports and field markers may be shown
            publicly after review. We may reject or remove any submission.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Acceptable use
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>Do not interfere with the app, bypass access controls, test vulnerabilities without written permission, or burden its services.</li>
            <li>Do not scrape, bulk-download, copy, resell, or republish the app or its APIs without written permission.</li>
            <li>Do not use Frederick Radius content or data to train or evaluate an AI model without written permission.</li>
            <li>Do not use the Frederick Radius name or visual identity to suggest a relationship, endorsement, or different product.</li>
          </ul>
          <p>
            Search engines and other automated services may access only the paths
            and uses permitted by our published crawler controls or written
            permission.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Content, sources, and trademarks
          </h2>
          <p>
            Frederick Radius combines original editorial work with information
            from businesses, event organizers, public agencies, and third-party
            services. Those sources retain their own rights and licenses. Business
            names, logos, government names, and other marks belong to their
            respective owners. Their appearance is descriptive and does not imply
            endorsement. Photographs and original Frederick Radius content may not
            be republished without permission unless the item states otherwise.
          </p>
          <p>
            See{" "}
            <Link href="/trust" className={linkClass} style={{ color: "var(--app-cool)" }}>
              Trust &amp; sources
            </Link>{" "}
            for provenance and attribution details.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Third-party services
          </h2>
          <p>
            The app links to and relies on services we do not control. Their
            availability, content, security, and terms are their responsibility.
            Use third-party sites and services at your own discretion.
          </p>
          <p>
            Some place information, ratings, reviews, and photos are provided by
            Google Maps Platform. Use of those features is also subject to the{" "}
            <a
              href="https://cloud.google.com/maps-platform/terms"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              style={{ color: "var(--app-cool)" }}
            >
              Google Maps Platform Terms of Service
            </a>
            .
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            No warranties; limits on liability
          </h2>
          <p>
            To the fullest extent permitted by law, Frederick Radius is provided
            &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
            of accuracy, availability, fitness for a particular purpose, or
            non-infringement. To the fullest extent permitted by law, Frederick
            Radius and its operator will not be liable for indirect, incidental,
            special, consequential, or punitive damages, lost profits or data, or
            harm arising from reliance on the app or inability to use it. Nothing
            in these terms excludes liability that cannot legally be excluded.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Changes and Maryland law
          </h2>
          <p>
            We may change or discontinue features and update these terms. The
            effective date above will change when the terms do. Maryland law
            governs these terms, without regard to conflict-of-law rules. Any
            dispute that is not resolved informally will be brought in a court
            with jurisdiction in Frederick County, Maryland.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className={headingClass} style={{ color: "var(--app-ink)" }}>
            Contact
          </h2>
          <p>
            Questions, corrections, copyright concerns, or permission requests:
            {" "}
            <a href="mailto:hello@frederickradius.app" className={linkClass} style={{ color: "var(--app-brand)" }}>
              hello@frederickradius.app
            </a>
            .
          </p>
        </div>
      </section>

      <footer
        className="border-t pt-4 text-[12px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>&copy; 2025&ndash;2026 Frederick Radius. All rights reserved.</p>
      </footer>
    </div>
  );
}
