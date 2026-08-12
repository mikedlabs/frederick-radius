import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { ownerListingFacts } from "@/lib/business/owner-listing-confirmation";
import { approvedOwnerClaimForToken } from "@/lib/business/manage-access";
import ManagePanel from "@/components/business/ManagePanel";
import ListingConfirmationPanel from "@/components/business/ListingConfirmationPanel";

export const metadata: Metadata = {
  title: "Manage your business",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Owner management surface. Token-gated with no login: the manage_token
 * (minted when an admin approves the business claim) is the capability
 * credential, the same pattern as radii short codes. An unknown or
 * unapproved token is a plain 404. Lives outside the (app) route group,
 * so it renders chrome-free like /business/claim.
 */
export default async function ManageBusinessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A missing submissions table (migration not yet applied) or any DB
  // error means the token simply cannot resolve: treat it as a 404,
  // never a crash.
  let row: Awaited<ReturnType<typeof approvedOwnerClaimForToken>>;
  try {
    row = await approvedOwnerClaimForToken(token);
  } catch {
    notFound();
  }
  if (!row) notFound();

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const place = row.place_slug ? getPlaceBySlug(row.place_slug) : null;
  const businessName =
    typeof payload.business_name === "string" && payload.business_name.trim()
      ? payload.business_name
      : place?.name ?? "Your business";

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8">
      <Link href="/" className="text-xs" style={{ color: "var(--app-cool)" }}>
        Back to Frederick Radius
      </Link>
      <header className="mt-4 space-y-2">
        <p
          className="text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--app-cool)" }}
        >
          Owner tools
        </p>
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {businessName}
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Keep the public details useful, then share anything timely. This link
          is private to you, so keep it safe.
        </p>
      </header>
      {place && row.place_slug ? (
        <ListingConfirmationPanel
          token={token}
          facts={ownerListingFacts(place)}
          listingHref={`/places/${row.place_slug}`}
        />
      ) : (
        <section
          className="mt-7 rounded-[var(--app-radius-md)] border px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <h2
            className="font-serif text-[19px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Listing confirmation is not ready yet
          </h2>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Radius still needs to connect this owner link to the public
            listing. You can continue posting updates below.
          </p>
        </section>
      )}

      <section
        aria-labelledby="owner-post-title"
        className="mt-10 border-t pt-8"
        style={{ borderColor: "var(--app-border)" }}
      >
        <h2
          id="owner-post-title"
          className="font-serif text-[21px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Post an update
        </h2>
        <p
          className="mt-1 text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Share a special or event. Radius reviews each post before it reaches
          people who follow your business.
        </p>
        <ManagePanel token={token} businessName={businessName} />
      </section>
    </div>
  );
}
