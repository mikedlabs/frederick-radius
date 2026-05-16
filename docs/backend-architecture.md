# Backend Platform Architecture (proposal, for approval)

Status: DRAFT for Mike's review. Nothing here is built yet. Build is
phased and gated on sign-off. Spec-first because auth, RLS, and PII done
ad hoc create security and privacy debt that is expensive to unwind.

## Goal

Add accounts and profiles so the app can unlock its biggest features:
business claim and dashboards (the business persona and revenue story),
persistent personalization (saved places, resident vs visitor that
sticks), and trustworthy identity for the approved Civic "Problems" MVP
(attribution and anti-abuse).

## Stack decision

Use **Supabase Auth + Postgres** (already the database; Drizzle +
postgres-js are already wired). No new vendor. Email magic-link and
OAuth (Google, Apple) to start; no passwords to store. Row-Level
Security (RLS) is the enforcement boundary, not app code.

## Identity model

Three principal types, one auth:

- **Visitor (anonymous)** — today's behavior. No account. Saved/state in
  localStorage. Never blocked by auth.
- **Resident (authenticated user)** — optional account for sync,
  personalization, civic reporting attribution.
- **Business owner** — a Resident who has claimed and verified a
  business; gets a dashboard scoped to their place(s).

Auth is always optional. Anonymous use stays fully functional; accounts
add capability, never gate the core civic/data experience.

## Schema (additive, new tables only; never alters static place data)

- `profiles` (1:1 with `auth.users`): id (uuid, FK auth.users),
  display_name, audience ('resident' | 'visitor'), created_at. RLS:
  a user reads/writes only their own row.
- `saved_places`: user_id, place_slug, created_at. RLS: owner-only.
- `business_claims`: id, user_id, place_slug, status
  ('pending' | 'verified' | 'rejected'), evidence (jsonb: method,
  contact), created_at, decided_at, decided_by. RLS: claimant reads own;
  only admin role writes status.
- `business_profiles`: place_slug (PK), owner_user_id (nullable until
  verified), hours_override jsonb, description_override, links jsonb,
  updated_at. RLS: public read; write only by the verified owner or
  admin. Renders only after verification; never overrides the audited
  geocoded coordinates (placement stays authoritative).
- `civic_reports` (powers the Civic Problems MVP): id, type, geom,
  description, photo_url, reporter_user_id (nullable for anon),
  status, confirmations int, created_at, expires_at. RLS: public read
  of non-hidden; insert rate-limited; status/hide is admin-only.
- `roles`: user_id, role ('admin' | 'moderator'). Drives the RLS
  policies above. Seeded manually; tiny.

All place/event source-of-truth stays in the static + DFP data and the
ingestion spine. These tables are an overlay, consistent with the
existing "additive, never mutate the authoritative data" principle.

## RLS posture (the security boundary)

- Default deny. Every table has explicit policies.
- Owner-only for personal data (`profiles`, `saved_places`).
- Public read / restricted write for `business_profiles`,
  `civic_reports`.
- Status transitions (claim approval, report moderation) are
  admin/moderator-only, enforced in policy, not in app code.
- Service-role key stays server-only (route handlers / cron); never
  shipped to the client. Client uses the anon key + user JWT.

## PII / privacy

- Minimal collection: email (auth), optional display name. No location
  history stored; geolocation stays client-side/session only.
- Civic reports may be anonymous; if attributed, only user_id is stored,
  never raw contact in the public row.
- A delete-account path removes profile, saved, and detaches/anonymizes
  reports. Documented retention.

## Moderation (required before civic write-path goes public)

- New civic reports default to a visible-but-unverified state with
  freshness decay and a confirm/flag affordance.
- Admin/moderator queue at `/admin/civic-review` (mirrors the existing
  `/admin/dedup-review` pattern: a review surface, decisions persisted
  as committed/queryable data).
- Rate limiting + minimum account age for first-party reports;
  abuse-prone fields sanitized; photos size/type checked.

## Phasing (each phase its own PR + verification; gated on approval)

1. **Auth + profiles** — Supabase Auth, `profiles`, `roles`, RLS,
   sign-in UI. Anonymous path untouched. No feature depends on it yet.
2. **Personalization** — `saved_places`; migrate localStorage saves on
   first sign-in; resident/visitor persists server-side.
3. **Business claim + dashboard** — `business_claims`,
   `business_profiles`, claim flow, verification, owner dashboard,
   `/admin` review. (The business persona unlock.)
4. **Civic reports** — `civic_reports`, the 1-tap report writing into
   the existing aggregated Problems layer, moderation queue. (Completes
   the approved Civic MVP with real identity/anti-abuse.)

## Cost / ops

Supabase free/pro tier covers this scale; Auth + Postgres are already
provisioned. Main new ops surface: RLS policy tests, a moderation queue,
and an account-deletion path. No new paid API.

## Open questions for Mike

- OAuth providers to enable first (Google and Apple recommended).
- Business verification method: emailed code to the business domain,
  phone, or manual admin review to start (manual is safest for v1).
- Who are the initial admins/moderators.
