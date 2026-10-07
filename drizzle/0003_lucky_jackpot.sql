ALTER TABLE "sales" ADD COLUMN "idempotency_key" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_idempotency_key_unique" UNIQUE("idempotency_key");