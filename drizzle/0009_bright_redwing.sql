ALTER TABLE "users" ADD COLUMN "username" varchar(64);--> statement-breakpoint
UPDATE "users"
SET "username" =
  left(
    coalesce(
      nullif(trim(both '._-' from regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]+', '_', 'g')), ''),
      'usuario'
    ),
    64 - length('.' || "id"::text)
  ) || '.' || "id"::text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");