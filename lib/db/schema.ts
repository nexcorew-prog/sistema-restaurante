import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    username: varchar('username', { length: 64 }).notNull().unique(),
    email: varchar('email', { length: 254 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 20 }).notNull().default('cashier'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [check('users_role_valid', sql`${table.role} IN ('admin', 'cashier')`)],
)

export const userSessions = pgTable(
  'user_sessions',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => [index('user_sessions_user_id_idx').on(table.userId)],
)

export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 60 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('categories_name_unique').on(sql`lower(${table.name})`)],
)

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    category: varchar('category', { length: 60 }).notNull(),
    priceCents: integer('price_cents').notNull(),
    imageData: text('image_data'),
    imageContentType: varchar('image_content_type', { length: 30 }),
    available: boolean('available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check('products_price_nonnegative', sql`${table.priceCents} >= 0`),
    check(
      'products_image_fields_valid',
      sql`(${table.imageData} IS NULL AND ${table.imageContentType} IS NULL) OR
        (${table.imageData} IS NOT NULL AND ${table.imageContentType} IN ('image/webp', 'image/jpeg', 'image/png'))`,
    ),
  ],
)

export const ingredients = pgTable(
  'ingredients',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    unit: varchar('unit', { length: 24 }).notNull(),
    stock: numeric('stock', { precision: 12, scale: 3 }).notNull().default('0'),
    lowStock: numeric('low_stock', { precision: 12, scale: 3 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check('ingredients_stock_nonnegative', sql`${table.stock} >= 0`),
    check('ingredients_low_stock_nonnegative', sql`${table.lowStock} >= 0`),
  ],
)

export const productIngredients = pgTable(
  'product_ingredients',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
  },
  table => [
    primaryKey({ columns: [table.productId, table.ingredientId] }),
    index('product_ingredients_ingredient_id_idx').on(table.ingredientId),
    check(
      'product_ingredients_quantity_positive',
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
  ],
)

export const cashSessions = pgTable(
  'cash_sessions',
  {
    id: serial('id').primaryKey(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    openingAmountCents: integer('opening_amount_cents').notNull(),
    countedAmountCents: integer('counted_amount_cents'),
    expectedAmountCents: integer('expected_amount_cents'),
    note: text('note'),
    openedBy: integer('opened_by').references(() => users.id, { onDelete: 'set null' }),
    closedBy: integer('closed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  table => [
    uniqueIndex('one_open_cash_session').on(table.closedAt).where(sql`${table.closedAt} IS NULL`),
    check('cash_sessions_opening_nonnegative', sql`${table.openingAmountCents} >= 0`),
  ],
)

export const sales = pgTable(
  'sales',
  {
    id: serial('id').primaryKey(),
    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    status: varchar('status', { length: 20 }).notNull().default('completed'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    cancelledBy: integer('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
    paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
    serviceType: varchar('service_type', { length: 20 }),
    customerName: varchar('customer_name', { length: 120 }),
    tableNumber: varchar('table_number', { length: 30 }),
    subtotalCents: integer('subtotal_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    cashReceivedCents: integer('cash_received_cents'),
    changeCents: integer('change_cents').notNull().default(0),
    cashierUserId: integer('cashier_user_id').references(() => users.id, { onDelete: 'set null' }),
    cashSessionId: integer('cash_session_id').references(() => cashSessions.id, {
      onDelete: 'set null',
    }),
  },
  table => [
    index('sales_created_at_idx').on(table.createdAt),
    index('sales_cash_session_id_idx').on(table.cashSessionId),
    check('sales_status_valid', sql`${table.status} IN ('completed', 'cancelled')`),
    check(
      'sales_cancellation_details_valid',
      sql`(${table.status} = 'completed' AND ${table.cancelledAt} IS NULL AND ${table.cancellationReason} IS NULL) OR
        (${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND
          ${table.cancellationReason} IS NOT NULL AND length(trim(${table.cancellationReason})) > 0)`,
    ),
    check(
      'sales_payment_method_valid',
      sql`${table.paymentMethod} IN ('cash', 'qr', 'card', 'transfer')`,
    ),
    check(
      'sales_service_type_valid',
      sql`${table.serviceType} IS NULL OR ${table.serviceType} IN ('takeaway', 'dine_in')`,
    ),
    check(
      'sales_service_details_valid',
      sql`${table.serviceType} IS NULL OR (
        ${table.customerName} IS NOT NULL AND length(trim(${table.customerName})) > 0 AND
        ((${table.serviceType} = 'takeaway' AND ${table.tableNumber} IS NULL) OR
         (${table.serviceType} = 'dine_in' AND ${table.tableNumber} IS NOT NULL AND length(trim(${table.tableNumber})) > 0))
      )`,
    ),
    check('sales_amounts_nonnegative', sql`${table.subtotalCents} >= 0 AND ${table.totalCents} >= 0`),
  ],
)

export const saleItems = pgTable(
  'sale_items',
  {
    id: serial('id').primaryKey(),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 120 }).notNull(),
    category: varchar('category', { length: 60 }).notNull().default('Sin categoría'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    excludedIngredients: jsonb('excluded_ingredients').$type<string[]>().notNull().default([]),
    note: text('note'),
    inventorySnapshot: jsonb('inventory_snapshot').$type<
      { ingredientId: number; name: string; quantity: number }[]
    >(),
  },
  table => [index('sale_items_sale_id_idx').on(table.saleId), check('sale_items_quantity_positive', sql`${table.quantity} > 0`)],
)

export const cashMovements = pgTable(
  'cash_movements',
  {
    id: serial('id').primaryKey(),
    cashSessionId: integer('cash_session_id')
      .notNull()
      .references(() => cashSessions.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    description: varchar('description', { length: 240 }).notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('cash_movements_session_id_idx').on(table.cashSessionId),
    check(
      'cash_movements_type_valid',
      sql`${table.type} IN ('sale', 'deposit', 'withdrawal')`,
    ),
    check('cash_movements_amount_positive', sql`${table.amountCents} > 0`),
  ],
)

export const settings = pgTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: text('value').notNull(),
})
