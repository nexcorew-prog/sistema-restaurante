CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree (lower("name"));
--> statement-breakpoint
INSERT INTO "categories" ("name")
VALUES ('Platos')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "categories" ("name")
SELECT DISTINCT ON (lower(btrim("category"))) btrim("category")
FROM "products"
WHERE btrim("category") <> ''
ORDER BY lower(btrim("category")), btrim("category")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "products"
SET "category" = 'Platos'
WHERE btrim("category") = '';
--> statement-breakpoint
UPDATE "products" AS product
SET "category" = category."name"
FROM "categories" AS category
WHERE lower(btrim(product."category")) = lower(category."name");