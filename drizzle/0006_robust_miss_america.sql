CREATE TABLE "business_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_slug" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"update_type" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"place_slug" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "place_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_slug" text NOT NULL,
	"claimed_by_user_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now(),
	"submission_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"home_muni_slug" text,
	"notification_prefs" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "business_updates_place_published_idx" ON "business_updates" USING btree ("place_slug","published_at");--> statement-breakpoint
CREATE INDEX "business_updates_status_idx" ON "business_updates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_user_place_uq" ON "follows" USING btree ("user_id","place_slug");--> statement-breakpoint
CREATE INDEX "follows_user_idx" ON "follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "follows_place_idx" ON "follows" USING btree ("place_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "place_claims_active_uq" ON "place_claims" USING btree ("place_slug") WHERE "place_claims"."status" = 'active';--> statement-breakpoint
CREATE INDEX "place_claims_user_idx" ON "place_claims" USING btree ("claimed_by_user_id");