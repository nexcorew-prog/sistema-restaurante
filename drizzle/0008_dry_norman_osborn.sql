ALTER TABLE "product_ingredients" DROP CONSTRAINT "product_ingredients_quantity_positive";--> statement-breakpoint
ALTER TABLE "product_ingredients" ALTER COLUMN "quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_quantity_positive" CHECK ("product_ingredients"."quantity" IS NULL OR "product_ingredients"."quantity" > 0);