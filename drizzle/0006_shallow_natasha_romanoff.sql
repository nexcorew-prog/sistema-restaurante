ALTER TABLE "sale_items" ADD COLUMN "category" varchar(60) DEFAULT 'Sin categoría' NOT NULL;--> statement-breakpoint
UPDATE "sale_items" AS sale_item
SET "category" = COALESCE(products."category", 'Sin categoría')
FROM "products"
WHERE sale_item."product_id" = products."id";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_by" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_status_valid" CHECK ("sales"."status" IN ('completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancellation_details_valid" CHECK (("sales"."status" = 'completed' AND "sales"."cancelled_at" IS NULL AND "sales"."cancellation_reason" IS NULL) OR
        ("sales"."status" = 'cancelled' AND "sales"."cancelled_at" IS NOT NULL AND
          "sales"."cancellation_reason" IS NOT NULL AND length(trim("sales"."cancellation_reason")) > 0));