CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"place_slug" text,
	"submitter_name" text,
	"submitter_email" text,
	"manage_token" text,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_kind_status_idx" ON "submissions" USING btree ("kind","status");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_manage_token_idx" ON "submissions" USING btree ("manage_token");
