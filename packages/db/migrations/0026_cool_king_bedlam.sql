-- OAuth Authorization Server: DCR columns on mcp_clients, the auth-code and
-- refresh-token state tables, and the mcp_token_issue audit action emitted by
-- the /token endpoint. The enum ADD VALUE is guarded (drizzle-kit emits it
-- bare) so a rerun or partially-applied migration replays cleanly — matching
-- 0025. The migrator wraps each migration in one transaction; ADD VALUE
-- without *using* the new value in that same transaction is safe in PG >=12.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='mcp_token_issue') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'mcp_token_issue'; END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text[] NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_authorization_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"rotated_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "client_secret" text;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "redirect_uris" text[];--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "grant_types" text[];--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "token_endpoint_auth_method" text;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "logo_uri" text;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "created_via" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_rotated_to_oauth_refresh_tokens_id_fk" FOREIGN KEY ("rotated_to") REFERENCES "public"."oauth_refresh_tokens"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_expires_idx" ON "oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_client_user_idx" ON "oauth_refresh_tokens" USING btree ("client_id","user_id");