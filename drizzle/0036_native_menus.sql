-- 0036_native_menus.sql — server-owned native restaurant menu storage.
--
-- WHY THIS EXISTS
-- ---------------
-- Official menu links are useful, but they cannot answer item-level questions
-- inside Radius. These four tables preserve a provider-neutral menu tree:
--
--   menu_sources   — the official/merchant-authorized source and its trust state
--   native_menus   — one breakfast, lunch, dinner, drinks, kids, etc. menu
--   menu_sections  — ordered groups within a menu
--   menu_items     — ordered items, price, availability, and supplied attributes
--
-- `place_slug` intentionally remains a loose key. The runtime place catalog is
-- still file-sourced, so linking to public.places would reject valid menu rows
-- whenever the static catalog is ahead of the database mirror.
--
-- TRUST CONTRACT
-- --------------
-- Publication, freshness, and availability are separate claims:
--
--   * record_status controls whether a record may be shown.
--   * freshness_status + checked_at + valid_until control whether it is current.
--   * availability_status is only the provider's item-level availability claim.
--
-- A published record must carry a current freshness state and a bounded validity
-- window. Runtime reads still check valid_until > now(), so a record cannot keep
-- presenting itself as current merely because a refresh job stopped.
--
-- SECURITY
-- --------
-- The tables are deliberately NOT a public PostgREST API. RLS is enabled with
-- no anon/authenticated policies, and both roles have every privilege revoked.
-- Public app surfaces read through the server DATABASE_URL and the repository
-- applies the published/current filters again. Writes are possible only through
-- the database owner or Supabase service_role; no credentials belong in any
-- provenance JSON.
--
-- Additive + idempotent. Apply BY HAND in Supabase after 0035, per
-- drizzle/README.md. Do not use drizzle-kit push/migrate in this project.

CREATE TABLE IF NOT EXISTS public.menu_sources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  place_slug            text        NOT NULL,
  provider              text        NOT NULL,
  source_kind           text        NOT NULL,
  source_key            text        NOT NULL,
  source_label          text        NOT NULL,
  source_url            text,
  external_merchant_id  text,
  provenance_method     text        NOT NULL,
  provenance            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  record_status         text        NOT NULL DEFAULT 'draft',
  verification_status   text        NOT NULL DEFAULT 'unverified',
  freshness_status      text        NOT NULL DEFAULT 'unknown',
  content_hash          text,
  source_updated_at     timestamptz,
  checked_at            timestamptz,
  valid_until           timestamptz,
  published_at          timestamptz,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT menu_sources_provider_check
    CHECK (provider IN (
      'toast',
      'square',
      'clover',
      'official_website',
      'owner_upload',
      'manual',
      'other'
    )),
  CONSTRAINT menu_sources_kind_check
    CHECK (source_kind IN (
      'pos_api',
      'official_html',
      'official_pdf',
      'owner_upload',
      'manual'
    )),
  CONSTRAINT menu_sources_provenance_method_check
    CHECK (provenance_method IN (
      'merchant_authorized',
      'official_public_source',
      'business_submission',
      'manual_verification'
    )),
  CONSTRAINT menu_sources_record_status_check
    CHECK (record_status IN ('draft', 'published', 'archived')),
  CONSTRAINT menu_sources_verification_status_check
    CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  CONSTRAINT menu_sources_freshness_status_check
    CHECK (freshness_status IN ('unknown', 'current', 'stale', 'error')),
  CONSTRAINT menu_sources_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  CONSTRAINT menu_sources_valid_window_check
    CHECK (valid_until IS NULL OR checked_at IS NULL OR valid_until > checked_at),
  CONSTRAINT menu_sources_publishable_check
    CHECK (
      record_status <> 'published'
      OR (
        verification_status = 'verified'
        AND freshness_status = 'current'
        AND checked_at IS NOT NULL
        AND valid_until IS NOT NULL
        AND published_at IS NOT NULL
        AND valid_until > checked_at
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_sources_identity_uq
  ON public.menu_sources (place_slug, provider, source_key);

CREATE INDEX IF NOT EXISTS menu_sources_public_place_idx
  ON public.menu_sources (place_slug, valid_until)
  WHERE record_status = 'published'
    AND verification_status = 'verified'
    AND freshness_status = 'current';

CREATE TABLE IF NOT EXISTS public.native_menus (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid        NOT NULL
    REFERENCES public.menu_sources (id) ON DELETE CASCADE,
  source_key         text        NOT NULL,
  name               text        NOT NULL,
  description        text,
  menu_type          text        NOT NULL DEFAULT 'other',
  currency           text        NOT NULL DEFAULT 'USD',
  canonical_url      text,
  provenance_url     text,
  provenance         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  record_status      text        NOT NULL DEFAULT 'draft',
  freshness_status   text        NOT NULL DEFAULT 'unknown',
  content_hash       text,
  source_updated_at  timestamptz,
  checked_at         timestamptz,
  valid_until        timestamptz,
  published_at       timestamptz,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT native_menus_type_check
    CHECK (menu_type IN (
      'main',
      'breakfast',
      'brunch',
      'lunch',
      'dinner',
      'kids',
      'drinks',
      'dessert',
      'happy_hour',
      'catering',
      'other'
    )),
  CONSTRAINT native_menus_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT native_menus_record_status_check
    CHECK (record_status IN ('draft', 'published', 'archived')),
  CONSTRAINT native_menus_freshness_status_check
    CHECK (freshness_status IN ('unknown', 'current', 'stale', 'error')),
  CONSTRAINT native_menus_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  CONSTRAINT native_menus_valid_window_check
    CHECK (valid_until IS NULL OR checked_at IS NULL OR valid_until > checked_at),
  CONSTRAINT native_menus_publishable_check
    CHECK (
      record_status <> 'published'
      OR (
        freshness_status = 'current'
        AND checked_at IS NOT NULL
        AND valid_until IS NOT NULL
        AND published_at IS NOT NULL
        AND valid_until > checked_at
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS native_menus_source_key_uq
  ON public.native_menus (source_id, source_key);

CREATE INDEX IF NOT EXISTS native_menus_public_source_idx
  ON public.native_menus (source_id, sort_order, valid_until)
  WHERE record_status = 'published'
    AND freshness_status = 'current';

CREATE TABLE IF NOT EXISTS public.menu_sections (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id            uuid        NOT NULL
    REFERENCES public.native_menus (id) ON DELETE CASCADE,
  source_key         text        NOT NULL,
  name               text        NOT NULL,
  description        text,
  provenance_url     text,
  provenance         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  record_status      text        NOT NULL DEFAULT 'draft',
  freshness_status   text        NOT NULL DEFAULT 'unknown',
  content_hash       text,
  source_updated_at  timestamptz,
  checked_at         timestamptz,
  valid_until        timestamptz,
  published_at       timestamptz,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT menu_sections_record_status_check
    CHECK (record_status IN ('draft', 'published', 'archived')),
  CONSTRAINT menu_sections_freshness_status_check
    CHECK (freshness_status IN ('unknown', 'current', 'stale', 'error')),
  CONSTRAINT menu_sections_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  CONSTRAINT menu_sections_valid_window_check
    CHECK (valid_until IS NULL OR checked_at IS NULL OR valid_until > checked_at),
  CONSTRAINT menu_sections_publishable_check
    CHECK (
      record_status <> 'published'
      OR (
        freshness_status = 'current'
        AND checked_at IS NOT NULL
        AND valid_until IS NOT NULL
        AND published_at IS NOT NULL
        AND valid_until > checked_at
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_sections_menu_key_uq
  ON public.menu_sections (menu_id, source_key);

CREATE INDEX IF NOT EXISTS menu_sections_public_menu_idx
  ON public.menu_sections (menu_id, sort_order, valid_until)
  WHERE record_status = 'published'
    AND freshness_status = 'current';

CREATE TABLE IF NOT EXISTS public.menu_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id            uuid        NOT NULL
    REFERENCES public.menu_sections (id) ON DELETE CASCADE,
  source_key            text        NOT NULL,
  name                  text        NOT NULL,
  description           text,
  price_minor           integer,
  price_currency        text        NOT NULL DEFAULT 'USD',
  price_display         text,
  availability_status   text        NOT NULL DEFAULT 'unknown',
  availability_evidence text        NOT NULL DEFAULT 'not_provided',
  availability_checked_at timestamptz,
  dietary_tags          text[]      NOT NULL DEFAULT '{}'::text[],
  dietary_evidence      text        NOT NULL DEFAULT 'not_provided',
  allergen_statement    text,
  calorie_count         integer,
  order_url             text,
  provenance_url        text,
  provenance            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  record_status         text        NOT NULL DEFAULT 'draft',
  freshness_status      text        NOT NULL DEFAULT 'unknown',
  content_hash          text,
  source_updated_at     timestamptz,
  checked_at            timestamptz,
  valid_until           timestamptz,
  published_at          timestamptz,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT menu_items_price_minor_check
    CHECK (price_minor IS NULL OR price_minor >= 0),
  CONSTRAINT menu_items_price_currency_check
    CHECK (price_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT menu_items_calorie_count_check
    CHECK (calorie_count IS NULL OR calorie_count >= 0),
  CONSTRAINT menu_items_availability_status_check
    CHECK (availability_status IN (
      'unknown',
      'available',
      'unavailable',
      'sold_out',
      'seasonal'
    )),
  CONSTRAINT menu_items_availability_evidence_check
    CHECK (availability_evidence IN (
      'not_provided',
      'provider_api',
      'business_submission',
      'official_menu',
      'manual_verification'
    )),
  CONSTRAINT menu_items_availability_claim_check
    CHECK (
      availability_status = 'unknown'
      OR (
        availability_evidence <> 'not_provided'
        AND availability_checked_at IS NOT NULL
      )
    ),
  CONSTRAINT menu_items_dietary_evidence_check
    CHECK (dietary_evidence IN (
      'not_provided',
      'provider_api',
      'business_submission',
      'official_menu',
      'manual_verification'
    )),
  CONSTRAINT menu_items_dietary_claim_check
    CHECK (
      (
        cardinality(dietary_tags) = 0
        AND allergen_statement IS NULL
        AND calorie_count IS NULL
      )
      OR dietary_evidence <> 'not_provided'
    ),
  CONSTRAINT menu_items_record_status_check
    CHECK (record_status IN ('draft', 'published', 'archived')),
  CONSTRAINT menu_items_freshness_status_check
    CHECK (freshness_status IN ('unknown', 'current', 'stale', 'error')),
  CONSTRAINT menu_items_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  CONSTRAINT menu_items_valid_window_check
    CHECK (valid_until IS NULL OR checked_at IS NULL OR valid_until > checked_at),
  CONSTRAINT menu_items_publishable_check
    CHECK (
      record_status <> 'published'
      OR (
        freshness_status = 'current'
        AND checked_at IS NOT NULL
        AND valid_until IS NOT NULL
        AND published_at IS NOT NULL
        AND valid_until > checked_at
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_section_key_uq
  ON public.menu_items (section_id, source_key);

CREATE INDEX IF NOT EXISTS menu_items_public_section_idx
  ON public.menu_items (section_id, sort_order, valid_until)
  WHERE record_status = 'published'
    AND freshness_status = 'current';

-- Item-level Radius search. The fixed English configuration makes the
-- expression immutable and must match the repository query exactly.
CREATE INDEX IF NOT EXISTS menu_items_search_idx
  ON public.menu_items
  USING gin (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(description, '')
    )
  );

-- RLS deny-all for public Data API roles. The server database role and
-- service_role remain the only application writers.
ALTER TABLE public.menu_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_menus  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items    ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.menu_sources
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.native_menus
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.menu_sections
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.menu_items
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_sources
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.native_menus
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_sections
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_items
  TO service_role;

COMMENT ON TABLE public.menu_sources IS
  'Server-owned provenance and trust state for merchant-authorized or official menu sources. RLS deny-all to anon/authenticated.';
COMMENT ON TABLE public.native_menus IS
  'Provider-neutral restaurant menus. Public app reads are server-side and require published, current source + menu rows.';
COMMENT ON TABLE public.menu_sections IS
  'Ordered sections within a native menu. Publication and freshness are explicit and bounded by valid_until.';
COMMENT ON TABLE public.menu_items IS
  'Ordered native menu items. Listing, freshness, and provider-supplied availability are separate claims; server-only writes.';

COMMENT ON COLUMN public.menu_sources.provenance IS
  'Non-secret source metadata only. Never store API keys, OAuth tokens, cookies, or raw credentials.';
COMMENT ON COLUMN public.menu_items.price_minor IS
  'Exact price in the currency minor unit (for USD, cents). Null means the source did not provide a fixed price.';
COMMENT ON COLUMN public.menu_items.availability_status IS
  'Provider-supplied item availability; independent of restaurant hours and publication status.';
COMMENT ON COLUMN public.menu_items.availability_evidence IS
  'Evidence class for availability_status. Inference is intentionally not an allowed value.';
COMMENT ON COLUMN public.menu_items.dietary_evidence IS
  'Evidence class for dietary_tags. Inference is intentionally not an allowed value.';
