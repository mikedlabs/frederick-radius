import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import ManagePanel from "@/components/business/ManagePanel";

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
  const db = getDb();
  if (!db) notFound();

  // A missing submissions table (migration not yet applied) or any DB
  // error means the token simply cannot resolve: treat it as a 404,
  // never a crash.
  let row: { payload: unknown } | undefined;
  try {
    const rows = await db
      .select({ payload: submissions.payload })
      .from(submissions)
      .where(
        and(
          eq(submissions.manage_token, token),
          eq(submissions.status, "approved"),
        ),
      )
      .limit(1);
    row = rows[0];
  } catch {
    notFound();
  }
  if (!row) notFound();

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const businessName =
    typeof payload.business_name === "string" && payload.business_name.trim()
      ? payload.business_name
      : "Your business";

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
          Post a special or an event. Approved posts reach the people who
          follow you on Frederick Radius. This link is private to you, so keep
          it safe.
        </p>
      </header>
      <ManagePanel token={token} businessName={businessName} />
    </div>
  );
}
