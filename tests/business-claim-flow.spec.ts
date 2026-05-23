/**
 * Business claim — end-to-end flow integration test.
 *
 * Exercises the real submission pipeline against a dedicated test
 * database:
 *
 *   submitBusinessClaimAction(input)
 *     -> row appears in `submissions` (kind=business_claim, status=pending)
 *     -> reviewSubmission({ decision: "approved" })
 *     -> row flips to status=approved, manage_token minted
 *     -> a separate query by (manage_token, status=approved) finds the row
 *     -> a bogus token finds nothing
 *
 * Safety: this suite is opt-in via `TEST_DATABASE_URL`. It will NEVER
 * run against `DATABASE_URL` (the dev / prod variable), because doing
 * so would write rows to the same submissions table real owners use.
 * To run it locally, point `TEST_DATABASE_URL` at a throwaway Postgres
 * with the same schema applied (e.g. a local Docker postgres after
 * `npm run db:push`):
 *
 *   TEST_DATABASE_URL=postgres://... npx vitest run tests/business-claim-flow.spec.ts
 *
 * Without `TEST_DATABASE_URL` set, the whole suite is `describe.skip`
 * so CI and ordinary local runs are no-ops.
 *
 * Test isolation: every inserted row carries a unique `submitter_email`
 * with a `vitest-claim-` prefix, and the afterAll hook deletes only
 * those rows.
 */
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

if (TEST_DB_URL) {
  // The db client reads `DATABASE_URL` (or its peers) at first use.
  // Point it at the throwaway DB *before* any code imports the client.
  process.env.DATABASE_URL = TEST_DB_URL;
}

const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("business claim flow (integration)", () => {
  const RUN_ID = `vitest-claim-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const TEST_EMAIL_1 = `${RUN_ID}-owner1@example.test`;
  const TEST_EMAIL_2 = `${RUN_ID}-owner2@example.test`;

  afterAll(async () => {
    try {
      const { getDb } = await import("@/lib/db/client");
      const { submissions } = await import("@/lib/db/schema");
      const { inArray } = await import("drizzle-orm");
      const db = getDb();
      if (!db) return;
      await db
        .delete(submissions)
        .where(inArray(submissions.submitter_email, [TEST_EMAIL_1, TEST_EMAIL_2]));
    } catch (err) {
      console.warn("[business-claim-flow] cleanup failed:", err);
    }
  });

  it("submit → admin approve → manage_token gates the management page", async () => {
    const { submitBusinessClaimAction } = await import(
      "@/components/submit/actions"
    );
    const { reviewSubmission } = await import("@/app/admin/claims/actions");
    const { getDb } = await import("@/lib/db/client");
    const { submissions } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");

    const db = getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    // 1. Submit a real-looking claim.
    const result = await submitBusinessClaimAction({
      business_name: "Idiom Brewing Co.",
      place_slug: "",
      owner_name: "Alex Rivera",
      owner_role: "Owner",
      owner_email: TEST_EMAIL_1,
      owner_phone: "(240) 555-0142",
      note: "Test submission from vitest — safe to delete.",
    });
    expect(typeof result.token).toBe("string");

    // 2. The row should exist as a pending business_claim.
    const pendingRows = await db
      .select({
        id: submissions.id,
        kind: submissions.kind,
        status: submissions.status,
        manage_token: submissions.manage_token,
      })
      .from(submissions)
      .where(eq(submissions.submitter_email, TEST_EMAIL_1))
      .limit(1);

    expect(pendingRows).toHaveLength(1);
    const pending = pendingRows[0];
    expect(pending.kind).toBe("business_claim");
    expect(pending.status).toBe("pending");
    expect(pending.manage_token).toBeNull();

    // 3. Admin approves.
    const form = new FormData();
    form.set("id", pending.id);
    form.set("decision", "approved");
    await reviewSubmission(form);

    // 4. Row should now be approved with a token issued.
    const approvedRows = await db
      .select({
        status: submissions.status,
        manage_token: submissions.manage_token,
      })
      .from(submissions)
      .where(eq(submissions.id, pending.id))
      .limit(1);

    expect(approvedRows).toHaveLength(1);
    const approved = approvedRows[0];
    expect(approved.status).toBe("approved");
    expect(approved.manage_token).toBeTruthy();
    expect(typeof approved.manage_token).toBe("string");

    // 5. The manage page query (token + status=approved) should find it.
    const found = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.manage_token, approved.manage_token as string),
          eq(submissions.status, "approved"),
        ),
      )
      .limit(1);

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(pending.id);

    // 6. A bogus token should NEVER find a row.
    const bogus = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.manage_token, "00000000-0000-0000-0000-000000000000"),
          eq(submissions.status, "approved"),
        ),
      )
      .limit(1);

    expect(bogus).toHaveLength(0);
  }, 30_000);

  it("rejection path: approved=false leaves no manage_token", async () => {
    const { submitBusinessClaimAction } = await import(
      "@/components/submit/actions"
    );
    const { reviewSubmission } = await import("@/app/admin/claims/actions");
    const { getDb } = await import("@/lib/db/client");
    const { submissions } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return;

    await submitBusinessClaimAction({
      business_name: "Test Co. (will reject)",
      place_slug: "",
      owner_name: "Skeptical Owner",
      owner_role: "Owner",
      owner_email: TEST_EMAIL_2,
      owner_phone: "(240) 555-0199",
      note: "Should be rejected.",
    });

    const rows = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.submitter_email, TEST_EMAIL_2))
      .limit(1);
    const id = rows[0]?.id;
    expect(id).toBeTruthy();

    const form = new FormData();
    form.set("id", id);
    form.set("decision", "rejected");
    await reviewSubmission(form);

    const after = await db
      .select({
        status: submissions.status,
        manage_token: submissions.manage_token,
      })
      .from(submissions)
      .where(eq(submissions.id, id))
      .limit(1);

    expect(after[0].status).toBe("rejected");
    expect(after[0].manage_token).toBeNull();
  }, 30_000);
});
