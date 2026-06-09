import type { Metadata } from "next";
import Link from "next/link";
import ClaimForm from "@/components/business/ClaimForm";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Claim your business",
  description:
    "Own or help run a Frederick County business? Claim your listing to keep it accurate.",
};

/**
 * Business-owner claim page. Lives outside the (app) route group, so it
 * renders chrome-free (no nav, no header) like /submit. A `?place=<slug>`
 * query deep-links the claim to a specific listing.
 */
export default async function ClaimBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const { place } = await searchParams;
  return (
    <div className="mx-auto max-w-screen-md px-4 py-8">
      <Link href="/" className="text-xs" style={{ color: "var(--app-cool)" }}>
        Back to Frederick Radius
      </Link>
      <header className="mt-4 space-y-2">
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Claim your business
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Own or help run a Frederick County business? Tell us who you are and
          we&apos;ll verify you. Once approved you can keep your hours, details,
          and specials accurate.
        </p>
      </header>
      <ClaimForm placeSlug={place ?? ""} />
    </div>
  );
}
