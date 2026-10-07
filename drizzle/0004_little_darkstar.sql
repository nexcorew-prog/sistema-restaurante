CREATE INDEX "cash_movements_session_id_idx" ON "cash_movements" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "product_ingredients_ingredient_id_idx" ON "product_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_cash_session_id_idx" ON "sales" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_type_valid" CHECK ("cash_movements"."type" IN ('sale', 'deposit', 'withdrawal'));--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_positive" CHECK ("cash_movements"."amount_cents" > 0);--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_nonnegative" CHECK ("cash_sessions"."opening_amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_stock_nonnegative" CHECK ("ingredients"."stock" >= 0);--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_low_stock_nonnegative" CHECK ("ingredients"."low_stock" >= 0);--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_quantity_positive" CHECK ("product_ingredients"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative" CHECK ("products"."price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_method_valid" CHECK ("sales"."payment_method" IN ('cash', 'qr', 'card', 'transfer'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts_nonnegative" CHECK ("sales"."subtotal_cents" >= 0 AND "sales"."total_cents" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_valid" CHECK ("users"."role" IN ('admin', 'cashier'));