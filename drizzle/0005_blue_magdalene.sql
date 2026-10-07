ALTER TABLE "sales" ADD COLUMN "service_type" varchar(20);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "customer_name" varchar(120);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "table_number" varchar(30);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_service_type_valid" CHECK ("sales"."service_type" IS NULL OR "sales"."service_type" IN ('takeaway', 'dine_in'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_service_details_valid" CHECK ("sales"."service_type" IS NULL OR (
        "sales"."customer_name" IS NOT NULL AND length(trim("sales"."customer_name")) > 0 AND
        (("sales"."service_type" = 'takeaway' AND "sales"."table_number" IS NULL) OR
         ("sales"."service_type" = 'dine_in' AND "sales"."table_number" IS NOT NULL AND length(trim("sales"."table_number")) > 0))
      ));