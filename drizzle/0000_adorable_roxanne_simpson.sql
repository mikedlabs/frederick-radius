CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_slug" text,
	"icon" text,
	"color" text,
	"display_order" integer DEFAULT 0,
	"blurb" text,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "civic_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"severity" text,
	"source" text,
	"starts_at" timestamp with time zone DEFAULT now(),
	"ends_at" timestamp with time zone,
	"link" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text,
	"type" text,
	"url" text,
	"enabled" boolean DEFAULT true,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"config" jsonb,
	CONSTRAINT "data_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text DEFAULT 'America/New_York',
	"is_all_day" boolean DEFAULT false,
	"is_recurring" boolean DEFAULT false,
	"recurrence_text" text,
	"venue_place_slug" text,
	"venue_name" text,
	"lng" double precision,
	"lat" double precision,
	"address" text,
	"municipality_slug" text,
	"hero_image" text,
	"category_slug" text,
	"audience" jsonb,
	"is_free" boolean DEFAULT false,
	"price_text" text,
	"ticket_url" text,
	"rsvp_url" text,
	"organizer" text,
	"status" text DEFAULT 'scheduled',
	"status_note" text,
	"source" text DEFAULT 'seed',
	"source_record_id" text,
	"source_fetched_at" timestamp with time zone,
	"confidence" real DEFAULT 1,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_slug" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	"status" text,
	"records_in" integer DEFAULT 0,
	"records_upserted" integer DEFAULT 0,
	"records_failed" integer DEFAULT 0,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "municipalities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"population" integer,
	"est" integer,
	"centroid_lng" double precision,
	"centroid_lat" double precision,
	"bbox_min_lng" double precision,
	"bbox_min_lat" double precision,
	"bbox_max_lng" double precision,
	"bbox_max_lat" double precision,
	"description" text,
	"hero_blurb" text,
	"hero_image" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "municipalities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_slug" text NOT NULL,
	"subcategory_slugs" jsonb,
	"tag_slugs" jsonb,
	"description" text,
	"short_blurb" text,
	"address" text,
	"city" text,
	"state" text DEFAULT 'MD',
	"postal_code" text,
	"municipality_slug" text,
	"lng" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"socials" jsonb,
	"hours" jsonb,
	"hours_text" text,
	"price_band" smallint,
	"amenities" jsonb,
	"accessibility" jsonb,
	"hero_image" text,
	"is_verified" boolean DEFAULT false,
	"verified_at" timestamp with time zone,
	"feature_score" real DEFAULT 5,
	"owner_note" text,
	"source" text DEFAULT 'seed',
	"source_record_id" text,
	"source_fetched_at" timestamp with time zone,
	"confidence" real DEFAULT 1,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "places_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "radii" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"device_id" text,
	"short_code" text NOT NULL,
	"name" text,
	"center_lng" double precision NOT NULL,
	"center_lat" double precision NOT NULL,
	"mode" text,
	"minutes" integer,
	"meters" integer,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "radii_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"facet" text,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_muni_starts_idx" ON "events" USING btree ("municipality_slug","starts_at");--> statement-breakpoint
CREATE INDEX "ingest_runs_source_time_idx" ON "ingest_runs" USING btree ("source_slug","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "municipalities_slug_idx" ON "municipalities" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "places_slug_idx" ON "places" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "places_municipality_idx" ON "places" USING btree ("municipality_slug");--> statement-breakpoint
CREATE INDEX "places_category_idx" ON "places" USING btree ("category_slug");--> statement-breakpoint
CREATE INDEX "places_lng_lat_idx" ON "places" USING btree ("lng","lat");