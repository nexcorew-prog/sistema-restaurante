CREATE TABLE "product_ingredients" (
	"product_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	CONSTRAINT "product_ingredients_product_id_ingredient_id_pk" PRIMARY KEY("product_id","ingredient_id")
);
--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "ingredients";